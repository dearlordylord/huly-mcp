use crate::{
    BridgeError, Result,
    bootstrap::{self, Bootstrap, Helper},
    buffer::Input,
    os::{self, Interest},
    wire::*,
};
use socket2::{Domain, SockAddr, Socket, Type};
use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, OwnedFd};
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

pub enum Launch {
    Closed,
    Local(Helper),
    Resident(UnixStream),
}
enum Phase {
    Decision(Vec<u8>),
    Configured {
        control: Vec<u8>,
        permission_sent: bool,
    },
    Connecting {
        socket: UnixStream,
        info: Bootstrap,
    },
    Hello {
        socket: UnixStream,
        info: Bootstrap,
        sent: usize,
    },
    Attached {
        socket: UnixStream,
        sent: usize,
    },
}

fn read_control(helper: &mut Helper, bytes: &mut Vec<u8>) -> Result<bool> {
    let mut buffer = [0; 4096];
    match helper.control.read(&mut buffer) {
        Ok(0) => Ok(true),
        Ok(size) => {
            bytes.extend_from_slice(&buffer[..size]);
            if bytes.len() > NATIVE_CONTROL_BYTES {
                return Err(BridgeError::Control);
            }
            Ok(false)
        }
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
            ) =>
        {
            Ok(false)
        }
        Err(error) => Err(error.into()),
    }
}

fn connect(info: Bootstrap) -> Result<Phase> {
    bootstrap::private_socket(&info.socket)?;
    let socket = Socket::new(Domain::UNIX, Type::STREAM, None)?;
    socket.set_nonblocking(true)?;
    let result = socket.connect(&SockAddr::unix(&info.socket)?);
    let descriptor: OwnedFd = socket.into();
    let socket = UnixStream::from(descriptor);
    match result {
        Ok(()) => Ok(Phase::Hello {
            socket,
            info,
            sent: 0,
        }),
        Err(error) if error.raw_os_error() == Some(libc::EINPROGRESS) => {
            Ok(Phase::Connecting { socket, info })
        }
        Err(error) => Err(error.into()),
    }
}

pub fn prepare(
    mut helper: Helper,
    input: &mut Input,
    source: &mut File,
    deadline: Instant,
) -> Result<Launch> {
    let mut phase = Phase::Decision(Vec::new());
    let attached = format!("{NATIVE_ATTACHED_HEADER}\n");
    loop {
        if os::signal_status().is_some() {
            return Ok(Launch::Closed);
        }
        if Instant::now() >= deadline {
            return Err(BridgeError::Startup);
        }
        input.read(source)?;
        let mut control_fd = -1;
        let mut socket_fd = -1;
        let mut helper_write = false;
        let mut socket_write = false;
        let previous = std::mem::discriminant(&phase);
        phase = match phase {
            Phase::Decision(mut control) => {
                control_fd = helper.control.as_raw_fd();
                let closed = read_control(&mut helper, &mut control)?;
                if let Some(line_end) = control.iter().position(|byte| *byte == b'\n') {
                    let line = &control[..line_end];
                    if line == NATIVE_LOCAL_HEADER.as_bytes() {
                        return Ok(Launch::Local(helper));
                    }
                    if line != NATIVE_CONFIGURED_HEADER.as_bytes() {
                        return Err(BridgeError::Control);
                    }
                    if input.closed && input.queue.is_empty() {
                        return Ok(Launch::Closed);
                    }
                    Phase::Configured {
                        control: control[line_end + 1..].to_vec(),
                        permission_sent: false,
                    }
                } else {
                    if closed {
                        return Err(BridgeError::Control);
                    }
                    Phase::Decision(control)
                }
            }
            Phase::Configured {
                mut control,
                mut permission_sent,
            } => {
                if !permission_sent {
                    match helper.write(&[NATIVE_ACK]) {
                        Ok(1) => permission_sent = true,
                        Ok(_) => return Err(BridgeError::Control),
                        Err(error) if crate::buffer::retryable(&error) => {}
                        Err(error) => return Err(error),
                    }
                }
                helper_write = !permission_sent;
                control_fd = helper.control.as_raw_fd();
                if read_control(&mut helper, &mut control)? {
                    let info = bootstrap::parse_control(&control)?;
                    control.fill(0);
                    connect(info)?
                } else {
                    Phase::Configured {
                        control,
                        permission_sent,
                    }
                }
            }
            Phase::Connecting { socket, info } => {
                socket_fd = socket.as_raw_fd();
                socket_write = true;
                if let Some(error) = socket.take_error()? {
                    return Err(error.into());
                }
                match socket.peer_addr() {
                    Ok(_) => Phase::Hello {
                        socket,
                        info,
                        sent: 0,
                    },
                    Err(error) if error.raw_os_error() == Some(libc::ENOTCONN) => {
                        Phase::Connecting { socket, info }
                    }
                    Err(error) => return Err(error.into()),
                }
            }
            Phase::Hello {
                mut socket,
                mut info,
                mut sent,
            } => {
                socket_fd = socket.as_raw_fd();
                if sent < info.hello.len() {
                    match socket.write(&info.hello[sent..]) {
                        Ok(0) => return Err(io::ErrorKind::WriteZero.into()),
                        Ok(size) => sent += size,
                        Err(error)
                            if matches!(
                                error.kind(),
                                io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                            ) => {}
                        Err(error) => return Err(error.into()),
                    }
                }
                socket_write = sent < info.hello.len();
                if sent == info.hello.len() {
                    let mut ack = [0];
                    match socket.read(&mut ack) {
                        Ok(1) if ack[0] == NATIVE_ACK => {
                            info.hello.fill(0);
                            Phase::Attached { socket, sent: 0 }
                        }
                        Ok(_) => return Err(BridgeError::Control),
                        Err(error)
                            if matches!(
                                error.kind(),
                                io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                            ) =>
                        {
                            Phase::Hello { socket, info, sent }
                        }
                        Err(error) => return Err(error.into()),
                    }
                } else {
                    Phase::Hello { socket, info, sent }
                }
            }
            Phase::Attached { socket, mut sent } => {
                if sent < attached.len() {
                    match helper.write(&attached.as_bytes()[sent..]) {
                        Ok(0) => return Err(io::ErrorKind::WriteZero.into()),
                        Ok(size) => sent += size,
                        Err(error) if crate::buffer::retryable(&error) => {}
                        Err(error) => return Err(error),
                    }
                }
                helper_write = sent < attached.len();
                if let Some(status) = helper.status()? {
                    if !status.success() || helper_write {
                        return Err(BridgeError::Helper);
                    }
                    return Ok(Launch::Resident(socket));
                }
                Phase::Attached { socket, sent }
            }
        };
        if !matches!(phase, Phase::Decision(_)) && input.closed && input.queue.is_empty() {
            return Ok(Launch::Closed);
        }
        // Completed transitions need no timer tick; only external I/O should suspend startup.
        if std::mem::discriminant(&phase) != previous {
            continue;
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
            Interest::new(control_fd, true, false),
            Interest::new(
                if matches!(phase, Phase::Attached { .. }) {
                    helper.output.as_raw_fd()
                } else {
                    -1
                },
                true,
                false,
            ),
            Interest::new(socket_fd, true, socket_write),
            Interest::new(
                if helper_write {
                    helper.input_fd().unwrap_or(-1)
                } else {
                    -1
                },
                false,
                true,
            ),
        ];
        os::wait(
            &interests,
            Duration::from_millis(100).min(deadline.saturating_duration_since(Instant::now())),
        )?;
    }
}
