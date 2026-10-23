use crate::{BridgeError, Result, os, wire::*};
use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::Write;
use std::os::fd::{AsRawFd, RawFd};
use std::os::unix::fs::{FileTypeExt, MetadataExt};
use std::os::unix::process::CommandExt;
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

pub struct Bootstrap {
    pub socket: PathBuf,
    pub hello: Vec<u8>,
}

impl Drop for Bootstrap {
    fn drop(&mut self) {
        self.hello.fill(0);
    }
}

pub fn parse_control(frame: &[u8]) -> Result<Bootstrap> {
    if frame.len() > NATIVE_CONTROL_BYTES {
        return Err(BridgeError::Control);
    }
    let separator = frame
        .iter()
        .position(|byte| *byte == b'\n')
        .ok_or(BridgeError::Control)?;
    let (path, rest) = frame.split_at(separator);
    let hello = &rest[1..];
    if hello.len() < 2 || hello.last() != Some(&b'\n') || hello[..hello.len() - 1].contains(&b'\n')
    {
        return Err(BridgeError::Control);
    }
    let text = std::str::from_utf8(path).map_err(|_| BridgeError::Control)?;
    let socket = Path::new(text);
    if path.len() >= NATIVE_PATH_BYTES
        || path.contains(&0)
        || path.contains(&b'\r')
        || !socket.is_absolute()
        || text.contains("//")
        || text.ends_with('/')
        || socket
            .components()
            .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
        || text.split('/').any(|part| part == "." || part == "..")
    {
        return Err(BridgeError::Control);
    }
    Ok(Bootstrap {
        socket: socket.to_owned(),
        hello: hello.to_vec(),
    })
}

pub fn private_socket(path: &Path) -> Result<()> {
    let directory = path.parent().ok_or(BridgeError::Control)?;
    // SAFETY: geteuid has no arguments or memory access preconditions.
    let uid = unsafe { libc::geteuid() };
    for (item, socket) in [(directory, false), (path, true)] {
        let meta = fs::symlink_metadata(item)?;
        let correct_type = if socket {
            meta.file_type().is_socket()
        } else {
            meta.is_dir()
        };
        let mode = if socket { 0o600 } else { 0o700 };
        if meta.uid() != uid || !correct_type || meta.mode() & 0o777 != mode {
            return Err(BridgeError::Control);
        }
    }
    Ok(())
}

struct ChildOwner(Child);

pub struct Helper {
    child: ChildOwner,
    pub input: Option<ChildStdin>,
    pub output: ChildStdout,
    pub control: File,
}

enum HelperMode {
    Bootstrap,
    Local,
    Metadata,
}

impl Helper {
    pub fn start(node: &OsStr, bundle: &OsStr) -> Result<Self> {
        Self::with_mode(node, bundle, HelperMode::Bootstrap)
    }
    pub fn local(node: &OsStr, bundle: &OsStr) -> Result<Self> {
        Self::with_mode(node, bundle, HelperMode::Local)
    }
    pub fn metadata(node: &OsStr, bundle: &OsStr) -> Result<Self> {
        Self::with_mode(node, bundle, HelperMode::Metadata)
    }
    fn with_mode(node: &OsStr, bundle: &OsStr, mode: HelperMode) -> Result<Self> {
        let (reader, writer) = os::control_pipe()?;
        let fd = writer.as_raw_fd();
        let mut command = Command::new(node);
        command
            .arg(bundle)
            .env(
                "MCP_TRANSPORT",
                match mode {
                    HelperMode::Bootstrap => "resident-bootstrap",
                    HelperMode::Local | HelperMode::Metadata => "stdio",
                },
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if matches!(mode, HelperMode::Metadata) {
            // Protocol metadata must not acquire Huly clients. On local fallback,
            // the same resolver acquires them at the first application operation.
            command
                .env("LAZY_ENVS", "true")
                .env("MCP_NATIVE_METADATA", "true");
        }
        // SAFETY: this closure only duplicates a live descriptor with async-signal-safe calls.
        unsafe {
            command.pre_exec(move || os::inherit_control(fd, NATIVE_CONTROL_FD));
        }
        let mut child = ChildOwner(command.spawn()?);
        drop(writer);
        let input = child.0.stdin.take().ok_or(BridgeError::Control)?;
        let output = child.0.stdout.take().ok_or(BridgeError::Control)?;
        os::nonblocking(input.as_raw_fd())?;
        os::nonblocking(output.as_raw_fd())?;
        Ok(Self {
            child,
            input: Some(input),
            output,
            control: File::from(reader),
        })
    }

    pub fn input_fd(&self) -> Option<RawFd> {
        self.input.as_ref().map(AsRawFd::as_raw_fd)
    }
    pub fn write(&mut self, bytes: &[u8]) -> Result<usize> {
        Ok(self
            .input
            .as_mut()
            .ok_or(BridgeError::Control)?
            .write(bytes)?)
    }
    pub fn status(&mut self) -> Result<Option<ExitStatus>> {
        Ok(self.child.0.try_wait()?)
    }
}

impl Drop for Helper {
    fn drop(&mut self) {
        self.input.take();
    }
}

impl Drop for ChildOwner {
    fn drop(&mut self) {
        if matches!(self.0.try_wait(), Ok(Some(_))) {
            return;
        }
        os::terminate(self.0.id());
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if matches!(self.0.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_bootstrap_frames_are_rejected() {
        let mut frames = vec![
            Vec::new(),
            b"relative\n{}\n".to_vec(),
            b"/tmp/../s\n{}\n".to_vec(),
            b"/tmp/./s\n{}\n".to_vec(),
            b"/tmp/x\r\n{}\n".to_vec(),
            b"/tmp/x\0\n{}\n".to_vec(),
            b"/tmp/x\n{}\nextra\n".to_vec(),
            b"/tmp/x\n".to_vec(),
            vec![b'x'; NATIVE_CONTROL_BYTES + 1],
        ];
        frames.push(format!("/{}\n{{}}\n", "a".repeat(NATIVE_PATH_BYTES)).into_bytes());
        for frame in frames {
            assert!(parse_control(&frame).is_err());
        }
    }
    #[test]
    fn proof_bytes_remain_opaque() {
        let info = parse_control(b"/tmp/private/s\n{\"opaque\":true}\n").unwrap();
        assert_eq!(info.socket, Path::new("/tmp/private/s"));
        assert_eq!(info.hello, b"{\"opaque\":true}\n");
    }
    #[test]
    fn private_socket_refuses_missing_or_regular_files() {
        let path =
            std::env::temp_dir().join(format!("huly-rust-not-socket-{}", std::process::id()));
        use std::os::unix::fs::PermissionsExt;
        fs::create_dir(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        let socket = path.join("s");
        let missing = private_socket(&socket);
        fs::write(&socket, b"not a socket").unwrap();
        fs::set_permissions(&socket, fs::Permissions::from_mode(0o600)).unwrap();
        let regular = private_socket(&socket);
        fs::remove_dir_all(&path).unwrap();
        assert!(missing.is_err());
        assert!(regular.is_err());
    }
}
