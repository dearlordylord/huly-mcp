//! A temporary ordinary stdio process owns discovery while resident selection is pending.
//! Application messages never enter that process until local fallback is selected.
use crate::{
    BridgeError, Result,
    bootstrap::Helper,
    buffer::{Input, Queue},
    transport,
    wire::*,
};
use serde_json::Value;
use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::io::{self, Read};
use std::os::fd::AsRawFd;
use std::time::{Duration, Instant};

const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

struct Pending {
    id: Value,
    initialize: Option<Vec<u8>>,
}

pub struct Metadata {
    node: OsString,
    bundle: OsString,
    helper: Option<Helper>,
    pending: Vec<Pending>,
    writes: Queue,
    replies: Input,
    output: Queue,
    line: Vec<u8>,
    reply_line: Vec<u8>,
    opaque: bool,
    initialized: Option<Vec<u8>>,
    initialized_notification: Option<Vec<u8>>,
}

impl Metadata {
    pub fn new(node: &OsStr, bundle: &OsStr) -> Self {
        Self {
            node: node.to_owned(),
            bundle: bundle.to_owned(),
            helper: None,
            pending: Vec::new(),
            writes: Queue::new(),
            replies: Input::new(),
            output: Queue::new(),
            line: Vec::new(),
            reply_line: Vec::new(),
            opaque: false,
            initialized: None,
            initialized_notification: None,
        }
    }

    pub fn read(&mut self, source: &mut File, input: &mut Input) -> Result<()> {
        if !self.can_read(input) {
            return Ok(());
        }
        let mut bytes = [0; NATIVE_FRAME_BYTES];
        let size = match source.read(&mut bytes) {
            Ok(size) => size,
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                ) =>
            {
                return Ok(());
            }
            Err(error) => return Err(error.into()),
        };
        if size == 0 {
            input.closed = true;
            self.flush_input(input);
            return Ok(());
        }
        let mut application = Vec::new();
        for part in bytes[..size].split_inclusive(|byte| *byte == b'\n') {
            if self.opaque || self.line.len() + part.len() > MAX_MESSAGE_BYTES {
                application.append(&mut self.line);
                application.extend_from_slice(part);
                self.opaque = part.last() != Some(&b'\n');
                continue;
            }
            self.line.extend_from_slice(part);
            if self.line.last() == Some(&b'\n') {
                let line = std::mem::take(&mut self.line);
                if !self.route(&line) {
                    application.extend_from_slice(&line);
                }
            }
        }
        push_bytes(&mut input.queue, application);
        // Every consumed byte is now owned by a queue or the partial-line buffer.
        if self.helper.is_none() && !self.writes.is_empty() {
            self.helper = Some(Helper::metadata(&self.node, &self.bundle)?);
        }
        Ok(())
    }

    fn route(&mut self, line: &[u8]) -> bool {
        // This is only a dispatch hint. The ordinary Effect MCP parser remains the
        // authority for payload validation, protocol versions, exposure and errors.
        let Ok(message) = serde_json::from_slice::<Value>(line) else {
            return false;
        };
        if message.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
            return false;
        }
        let Some(method) = message.get("method").and_then(Value::as_str) else {
            return false;
        };
        let metadata = matches!(
            method,
            "initialize" | "server/discover" | "tools/list" | "ping"
        );
        let notification = method == "notifications/initialized" && self.helper.is_some();
        if !metadata && !notification {
            return false;
        }
        if notification {
            self.initialized_notification = Some(line.to_vec());
        }
        if metadata {
            let Some(id) = message
                .get("id")
                .filter(|id| id.is_string() || id.is_number())
            else {
                return false;
            };
            if self.pending.len() >= NATIVE_METADATA_REQUESTS {
                return false;
            }
            self.pending.push(Pending {
                id: id.clone(),
                initialize: (method == "initialize").then(|| line.to_vec()),
            });
        }
        push_bytes(&mut self.writes, line.to_vec());
        true
    }

    pub fn progress(&mut self, output: &mut File) -> Result<()> {
        if let Some(helper) = &mut self.helper {
            if let Some(writer) = &mut helper.input {
                self.writes.write_to(writer)?;
            }
            if self.output.has_capacity() {
                self.replies.read(&mut helper.output)?;
            }
            while let Some(bytes) = self.replies.queue.pop() {
                let observed = self.observe(&bytes);
                self.output.push(bytes);
                observed?;
            }
            if self.replies.closed && !self.pending.is_empty() {
                return Err(BridgeError::Helper);
            }
        }
        transport::drain_output(&mut self.output, output)
    }

    fn observe(&mut self, bytes: &[u8]) -> Result<()> {
        for part in bytes.split_inclusive(|byte| *byte == b'\n') {
            if self.reply_line.len() + part.len() > NATIVE_METADATA_REPLY_BYTES {
                return Err(BridgeError::Control);
            }
            self.reply_line.extend_from_slice(part);
            if self.reply_line.last() != Some(&b'\n') {
                continue;
            }
            if let Ok(reply) = serde_json::from_slice::<Value>(&self.reply_line)
                && let Some(position) = self
                    .pending
                    .iter()
                    .position(|pending| reply.get("id") == Some(&pending.id))
                && (reply.get("result").is_some() || reply.get("error").is_some())
            {
                let pending = self.pending.remove(position);
                if reply.get("result").is_some() && pending.initialize.is_some() {
                    self.initialized = pending.initialize;
                }
            }
            self.reply_line.clear();
        }
        Ok(())
    }

    pub fn pending(&self) -> bool {
        !self.pending.is_empty() || !self.writes.is_empty() || !self.output.is_empty()
    }

    pub fn ready(
        &mut self,
        input: &mut Input,
        source: &mut File,
        output: &mut File,
        deadline: Instant,
    ) -> Result<()> {
        while self.pending() {
            if crate::os::signal_status().is_some() {
                return Err(BridgeError::Startup);
            }
            if Instant::now() >= deadline {
                return Err(BridgeError::Startup);
            }
            self.read(source, input)?;
            self.progress(output)?;
            crate::os::wait(&[], Duration::from_millis(1))?;
        }
        Ok(())
    }

    pub fn finish(
        &mut self,
        input: &mut Input,
        source: &mut File,
        output: &mut File,
        deadline: Instant,
    ) -> Result<Option<Vec<u8>>> {
        self.ready(input, source, output, deadline)?;
        self.flush_input(input);
        if let Some(notification) = self.initialized_notification.take() {
            let mut prefix = Queue::new();
            push_bytes(&mut prefix, notification);
            prefix.prepend_to(&mut input.queue);
        }
        Ok(self.initialized.take())
    }

    pub fn can_read(&self, input: &Input) -> bool {
        !input.closed && input.queue.has_capacity() && self.writes.has_capacity()
    }

    pub fn interests(&self, output: &File) -> [crate::os::Interest; 3] {
        let helper = self.helper.as_ref();
        [
            crate::os::Interest::new(
                if self.output.has_capacity() && !self.replies.closed {
                    helper.map_or(-1, |helper| helper.output.as_raw_fd())
                } else {
                    -1
                },
                true,
                false,
            ),
            crate::os::Interest::new(
                if self.writes.is_empty() {
                    -1
                } else {
                    helper.and_then(Helper::input_fd).unwrap_or(-1)
                },
                false,
                true,
            ),
            crate::os::Interest::new(
                if self.output.is_empty() {
                    -1
                } else {
                    output.as_raw_fd()
                },
                false,
                true,
            ),
        ]
    }

    fn flush_input(&mut self, input: &mut Input) {
        push_bytes(&mut input.queue, std::mem::take(&mut self.line));
    }

    pub fn local(&mut self, input: &mut Input, original: Option<Helper>) -> Result<Helper> {
        self.flush_input(input);
        self.writes.prepend_to(&mut input.queue);
        match self.helper.take().or(original) {
            Some(helper) => Ok(helper),
            None => Helper::local(&self.node, &self.bundle),
        }
    }

    pub fn take_output(&mut self) -> Queue {
        std::mem::replace(&mut self.output, Queue::new())
    }
}

fn push_bytes(queue: &mut Queue, bytes: Vec<u8>) {
    for chunk in bytes.chunks(NATIVE_FRAME_BYTES) {
        queue.push(chunk.to_vec());
    }
}
