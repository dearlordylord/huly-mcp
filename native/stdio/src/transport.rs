use crate::{
    BridgeError, Result,
    bootstrap::Helper,
    buffer::{Input, Queue},
    os::{self, Interest},
    wire::*,
};
use std::fs::File;
use std::io::{self, Read};
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(100);

pub fn frame(bytes: &[u8]) -> Vec<u8> {
    let mut encoded = Vec::with_capacity(NATIVE_FRAME_HEADER_BYTES + bytes.len());
    encoded.extend_from_slice(
        &u32::try_from(bytes.len())
            .expect("bounded native frame")
            .to_be_bytes(),
    );
    encoded.extend_from_slice(bytes);
    encoded
}

struct Frames {
    header: [u8; NATIVE_FRAME_HEADER_BYTES],
    header_read: usize,
    body: Vec<u8>,
    body_read: usize,
    diagnostic: bool,
}

impl Frames {
    fn new() -> Self {
        Self {
            header: [0; NATIVE_FRAME_HEADER_BYTES],
            header_read: 0,
            body: Vec::new(),
            body_read: 0,
            diagnostic: false,
        }
    }
    fn read(&mut self, stream: &mut UnixStream, output: &mut Queue) -> Result<()> {
        if !output.is_empty() {
            return Ok(());
        }
        if self.header_read < self.header.len() {
            match stream.read(&mut self.header[self.header_read..]) {
                Ok(0) => return Err(io::ErrorKind::UnexpectedEof.into()),
                Ok(size) => self.header_read += size,
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) =>
                {
                    return Ok(());
                }
                Err(error) => return Err(error.into()),
            }
            if self.header_read < self.header.len() {
                return Ok(());
            }
            let encoded = u32::from_be_bytes(self.header);
            self.diagnostic = encoded & NATIVE_DIAGNOSTIC_FLAG != 0;
            let size = usize::try_from(encoded & !NATIVE_DIAGNOSTIC_FLAG)
                .map_err(|_| BridgeError::Control)?;
            if size > NATIVE_FRAME_BYTES {
                return Err(BridgeError::Control);
            }
            self.body = vec![0; size];
        }
        if self.body_read < self.body.len() {
            match stream.read(&mut self.body[self.body_read..]) {
                Ok(0) => return Err(io::ErrorKind::UnexpectedEof.into()),
                Ok(size) => self.body_read += size,
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) =>
                {
                    return Ok(());
                }
                Err(error) => return Err(error.into()),
            }
        }
        if self.body_read == self.body.len() {
            if self.diagnostic {
                eprintln!("{}", String::from_utf8_lossy(&self.body));
                return Err(BridgeError::Control);
            }
            output.push(std::mem::take(&mut self.body));
            self.header_read = 0;
            self.body_read = 0;
        }
        Ok(())
    }
}

fn drain_output(queue: &mut Queue, output: &mut File) -> Result<()> {
    queue.check_output_deadline()?;
    queue.write_to(output).map_err(|_| BridgeError::Output)
}

pub fn resident(
    mut socket: UnixStream,
    input: &mut Input,
    source: &mut File,
    output: &mut File,
) -> Result<()> {
    let mut outgoing = Queue::new();
    let mut incoming = Queue::new();
    let mut frames = Frames::new();
    let mut heartbeat = Instant::now() + Duration::from_millis(NATIVE_HEARTBEAT_MILLIS);
    loop {
        if os::signal_status().is_some() {
            return Ok(());
        }
        input.read(source)?;
        if input.closed {
            return Ok(());
        }
        if Instant::now() >= heartbeat && outgoing.is_empty() {
            outgoing.push(frame(&[]));
            heartbeat = Instant::now() + Duration::from_millis(NATIVE_HEARTBEAT_MILLIS);
        }
        if outgoing.is_empty()
            && let Some(bytes) = input.queue.pop()
        {
            outgoing.push(frame(&bytes));
        }
        outgoing.write_to(&mut socket)?;
        frames.read(&mut socket, &mut incoming)?;
        drain_output(&mut incoming, output)?;
        let interests = [
            Interest::new(
                if input.queue.has_capacity() {
                    source.as_raw_fd()
                } else {
                    -1
                },
                true,
                false,
            ),
            Interest::new(
                socket.as_raw_fd(),
                incoming.is_empty(),
                !outgoing.is_empty(),
            ),
            Interest::new(
                if incoming.is_empty() {
                    -1
                } else {
                    output.as_raw_fd()
                },
                false,
                true,
            ),
        ];
        os::wait(&interests, POLL_INTERVAL)?;
    }
}

pub fn local(
    mut helper: Helper,
    input: &mut Input,
    source: &mut File,
    output: &mut File,
) -> Result<()> {
    let mut replies = Input::new();
    loop {
        if os::signal_status().is_some() {
            return Ok(());
        }
        input.read(source)?;
        if let Some(writer) = &mut helper.input {
            input.queue.write_to(writer)?;
        }
        if input.closed && input.queue.is_empty() {
            helper.input.take();
        }
        if replies.queue.is_empty() {
            replies.read(&mut helper.output)?;
        }
        drain_output(&mut replies.queue, output)?;
        if replies.closed
            && replies.queue.is_empty()
            && let Some(status) = helper.status()?
        {
            return if status.success() {
                Ok(())
            } else {
                Err(BridgeError::Helper)
            };
        }
        let interests = [
            Interest::new(
                if input.closed || !input.queue.has_capacity() {
                    -1
                } else {
                    source.as_raw_fd()
                },
                true,
                false,
            ),
            Interest::new(
                if input.queue.is_empty() {
                    -1
                } else {
                    helper.input_fd().unwrap_or(-1)
                },
                false,
                true,
            ),
            Interest::new(
                if replies.closed || !replies.queue.is_empty() {
                    -1
                } else {
                    helper.output.as_raw_fd()
                },
                true,
                false,
            ),
            Interest::new(
                if replies.queue.is_empty() {
                    -1
                } else {
                    output.as_raw_fd()
                },
                false,
                true,
            ),
        ];
        os::wait(&interests, POLL_INTERVAL)?;
    }
}
