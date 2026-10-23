//! Re-establish only the successful protocol initialization on the selected adapter.
//! No application request has been sent to either backend at this boundary.
use crate::{BridgeError, Result, buffer::Queue, os, transport, wire::*};
use serde_json::Value;
use std::io;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

pub fn initialize(socket: &mut UnixStream, request: &[u8], deadline: Instant) -> Result<()> {
    let message: Value = serde_json::from_slice(request).map_err(|_| BridgeError::Control)?;
    let id = message.get("id").ok_or(BridgeError::Control)?;
    let mut outgoing = Queue::new();
    for chunk in request.chunks(NATIVE_FRAME_BYTES) {
        outgoing.push(transport::frame(chunk));
    }
    let mut incoming = Queue::new();
    let mut frames = transport::Frames::new();
    let mut line = Vec::new();
    loop {
        if os::signal_status().is_some() {
            return Err(BridgeError::Startup);
        }
        if Instant::now() >= deadline {
            return Err(BridgeError::Startup);
        }
        outgoing.write_to(socket)?;
        frames.read(socket, &mut incoming)?;
        while let Some(bytes) = incoming.pop() {
            for part in bytes.split_inclusive(|byte| *byte == b'\n') {
                if line.len() + part.len() > NATIVE_CONTROL_BYTES {
                    return Err(BridgeError::Control);
                }
                line.extend_from_slice(part);
                if line.last() != Some(&b'\n') {
                    continue;
                }
                let reply: Value =
                    serde_json::from_slice(&line).map_err(|_| BridgeError::Control)?;
                if reply.get("id") == Some(id) {
                    return if reply.get("result").is_some() {
                        Ok(())
                    } else {
                        Err(BridgeError::Control)
                    };
                }
                // Initialization can emit notifications, but never another request's reply.
                if reply.get("id").is_some() {
                    return Err(io::ErrorKind::InvalidData.into());
                }
                line.clear();
            }
        }
        os::wait(
            &[os::Interest::new(
                socket.as_raw_fd(),
                true,
                !outgoing.is_empty(),
            )],
            Duration::from_millis(10).min(deadline.saturating_duration_since(Instant::now())),
        )?;
    }
}
