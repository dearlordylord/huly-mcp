use std::fs;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const FRAME_BYTES: usize = 65_536;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[test]
fn availability_check_exits_without_reading_stdin_or_starting_a_helper() {
    let mut process = Process(
        Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
            .arg("--check")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    assert!(process.wait(Duration::from_secs(1)).success());
    let mut output = Vec::new();
    process
        .0
        .stdout
        .take()
        .unwrap()
        .read_to_end(&mut output)
        .unwrap();
    assert!(output.is_empty());
    process
        .0
        .stderr
        .take()
        .unwrap()
        .read_to_end(&mut output)
        .unwrap();
    assert!(output.is_empty());
}

struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().canonicalize().unwrap().join(format!(
            "huly-rust-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        Self(path)
    }
    fn helper(&self, script: &str) -> PathBuf {
        let path = self.0.join("helper");
        fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        path
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct Process(Child);
impl Process {
    fn start(helper: &Path) -> Self {
        Self(
            Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
                .args([helper.as_os_str(), "unused".as_ref()])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap(),
        )
    }
    fn wait(&mut self, allowance: Duration) -> std::process::ExitStatus {
        let deadline = Instant::now() + allowance;
        loop {
            if let Some(status) = self.0.try_wait().unwrap() {
                return status;
            }
            assert!(
                Instant::now() < deadline,
                "native bridge did not exit within its allowance"
            );
            thread::sleep(Duration::from_millis(5));
        }
    }
    fn signal(&self, value: i32) {
        let pid = i32::try_from(self.0.id()).unwrap();
        // SAFETY: this test still owns an unreaped child, so the PID cannot be reused.
        assert_eq!(unsafe { libc::kill(pid, value) }, 0);
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        self.0.stdin.take();
        if matches!(self.0.try_wait(), Ok(Some(_))) {
            return;
        }
        let pid = i32::try_from(self.0.id()).unwrap();
        // SAFETY: the unreaped child is still owned by this guard.
        unsafe {
            libc::kill(pid, libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(6);
        while Instant::now() < deadline {
            if matches!(self.0.try_wait(), Ok(Some(_))) {
                return;
            }
            thread::sleep(Duration::from_millis(5));
        }
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

struct Server {
    directory: Directory,
    helper: PathBuf,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
impl Server {
    fn new(action: impl FnOnce(UnixStream) + Send + 'static) -> Self {
        let directory = Directory::new();
        let socket = directory.0.join("s");
        let listener = UnixListener::bind(&socket).unwrap();
        listener.set_nonblocking(true).unwrap();
        fs::set_permissions(&socket, fs::Permissions::from_mode(0o600)).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let ending = Arc::clone(&stop);
        let worker = thread::spawn(move || {
            while !ending.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        // Darwin inherits O_NONBLOCK from the listener; the real
                        // fixture peer uses bounded blocking reads on every OS.
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(15)))
                            .unwrap();
                        stream
                            .set_write_timeout(Some(Duration::from_secs(15)))
                            .unwrap();
                        action(stream);
                        return;
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5))
                    }
                    Err(error) => panic!("native fixture accept failed: {error}"),
                }
            }
        });
        let helper = directory.helper(&format!("printf 'configured\\n' >&3\ndd bs=1 count=1 >/dev/null 2>/dev/null\nprintf '%s\\n' '{}' '{{\"proof\":\"opaque\"}}' >&3\nexec 3>&-\nread attached\n[ \"$attached\" = attached ]", socket.display()));
        Self {
            directory,
            helper,
            stop,
            worker: Some(worker),
        }
    }
    fn finish(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.worker
            .take()
            .unwrap()
            .join()
            .expect("native fixture failed");
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn admit(stream: &mut UnixStream) {
    let mut hello = String::new();
    BufReader::new(&mut *stream).read_line(&mut hello).unwrap();
    assert_eq!(hello, "{\"proof\":\"opaque\"}\n");
    stream.write_all(&[1]).unwrap();
}
fn read_frame(stream: &mut UnixStream) -> io::Result<Vec<u8>> {
    let mut header = [0; 4];
    stream.read_exact(&mut header)?;
    let size = usize::try_from(u32::from_be_bytes(header)).unwrap();
    assert!(size <= FRAME_BYTES);
    let mut bytes = vec![0; size];
    stream.read_exact(&mut bytes)?;
    Ok(bytes)
}
fn write_frame(stream: &mut UnixStream, bytes: &[u8]) -> io::Result<()> {
    stream.write_all(&u32::try_from(bytes.len()).unwrap().to_be_bytes())?;
    stream.write_all(bytes)
}

#[test]
fn preserves_framing_and_byte_order_under_backpressure() {
    let mut fixture = Server::new(|mut socket| {
        admit(&mut socket);
        while let Ok(bytes) = read_frame(&mut socket) {
            if write_frame(&mut socket, &bytes).is_err() {
                break;
            }
        }
    });
    let mut process = Process::start(&fixture.helper);
    let payload = b"{\"id\":42,\"method\":\"ping\"}\n".repeat(10_000);
    let mut input = process.0.stdin.take().unwrap();
    let expected = payload.clone();
    let sender = thread::spawn(move || {
        input.write_all(&payload).unwrap();
        input
    });
    let mut received = vec![0; expected.len()];
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_exact(&mut received)
        .unwrap();
    assert_eq!(received, expected);
    drop(sender.join().unwrap());
    assert!(process.wait(Duration::from_secs(5)).success());
    fixture.finish();
}

#[test]
fn backend_loss_fails_without_reconnection_or_replay() {
    let (sent, received) = mpsc::channel();
    let mut fixture = Server::new(move |mut socket| {
        admit(&mut socket);
        sent.send(read_frame(&mut socket).unwrap()).unwrap();
    });
    let mut process = Process::start(&fixture.helper);
    process
        .0
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"opaque operation\n")
        .unwrap();
    assert_eq!(
        received.recv_timeout(Duration::from_secs(5)).unwrap(),
        b"opaque operation\n"
    );
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(1));
    fixture.finish();
}

#[test]
fn signal_closes_the_admitted_connection_and_joins_helper() {
    let (sent, received) = mpsc::channel();
    let mut fixture = Server::new(move |mut socket| {
        admit(&mut socket);
        sent.send(()).unwrap();
        let mut rest = Vec::new();
        // SIGTERM can arrive before the bridge consumes our admission ACK.
        // Closing a Unix socket with unread bytes may reset the peer instead
        // of delivering EOF; both prove the owned connection was closed.
        if let Err(error) = socket.read_to_end(&mut rest) {
            assert_eq!(error.kind(), io::ErrorKind::ConnectionReset);
        }
    });
    let mut process = Process::start(&fixture.helper);
    received.recv_timeout(Duration::from_secs(5)).unwrap();
    process.signal(libc::SIGTERM);
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(143));
    fixture.finish();
}

fn assert_local_echo(payload: Vec<u8>, queued: bool) {
    let directory = Directory::new();
    let helper = directory.helper("printf 'local\\n' >&3\nexec 3>&-\nexec cat");
    let mut process = Process::start(&helper);
    let mut input = process.0.stdin.take().unwrap();
    let expected = payload.clone();
    let sender = thread::spawn(move || {
        input.write_all(&payload).unwrap();
        if queued {
            thread::sleep(Duration::from_millis(1));
        }
    });
    let mut result = Vec::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_end(&mut result)
        .unwrap();
    sender.join().unwrap();
    assert_eq!(result, expected);
    assert!(process.wait(Duration::from_secs(5)).success());
}
#[test]
fn local_fallback_drains_buffered_input_and_output() {
    assert_local_echo(b"{\"id\":99}\n".repeat(30_000), false);
}
#[test]
fn local_fallback_preserves_input_queued_before_eof() {
    assert_local_echo(b"{\"id\":1}\n".to_vec(), true);
}
#[test]
fn local_fallback_can_publish_a_diagnostic_after_empty_eof() {
    let directory = Directory::new();
    let helper = directory.helper("printf 'local\\n' >&3\nexec 3>&-\nprintf 'diagnostic\\n'");
    let mut process = Process::start(&helper);
    process.0.stdin.take();
    let mut result = String::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut result)
        .unwrap();
    assert_eq!(result, "diagnostic\n");
    assert!(process.wait(Duration::from_secs(5)).success());
}

#[test]
fn unread_stdout_has_the_original_ten_second_bound() {
    let mut fixture = Server::new(|mut socket| {
        admit(&mut socket);
        for _ in 0..16 {
            if write_frame(&mut socket, &vec![b'x'; FRAME_BYTES]).is_err() {
                break;
            }
        }
    });
    let mut process = Process::start(&fixture.helper);
    assert_eq!(process.wait(Duration::from_secs(13)).code(), Some(1));
    let mut diagnostic = String::new();
    process
        .0
        .stderr
        .as_mut()
        .unwrap()
        .read_to_string(&mut diagnostic)
        .unwrap();
    assert!(diagnostic.contains("10 second"));
    fixture.finish();
}

// Linux exposes per-process CPU ticks, so this exercises the real HUP plus
// blocked-stdout regression without mixing CPU consumed by parallel test peers.
#[cfg(target_os = "linux")]
#[test]
fn backend_hangup_during_stdout_backpressure_does_not_spin() {
    use std::os::fd::AsRawFd;
    let (sent, received) = mpsc::channel();
    let mut fixture = Server::new(move |mut socket| {
        admit(&mut socket);
        write_frame(&mut socket, &vec![b'x'; FRAME_BYTES]).unwrap();
        drop(socket);
        sent.send(()).unwrap();
    });
    let mut process = Process::start(&fixture.helper);
    let output = process.0.stdout.as_ref().unwrap().as_raw_fd();
    // SAFETY: output is a live owned pipe descriptor; this only bounds capacity.
    assert!(unsafe { libc::fcntl(output, libc::F_SETPIPE_SZ, 4096) } > 0);
    received.recv_timeout(Duration::from_secs(5)).unwrap();
    let cpu_ticks = || {
        let stat = fs::read_to_string(format!("/proc/{}/stat", process.0.id())).unwrap();
        let fields: Vec<_> = stat
            .rsplit_once(')')
            .unwrap()
            .1
            .split_whitespace()
            .collect();
        fields[11].parse::<u64>().unwrap() + fields[12].parse::<u64>().unwrap()
    };
    let before = cpu_ticks();
    thread::sleep(Duration::from_millis(500));
    let consumed = cpu_ticks() - before;
    // SAFETY: sysconf reads the platform clock-tick constant and owns no pointer.
    let ticks_per_second = u64::try_from(unsafe { libc::sysconf(libc::_SC_CLK_TCK) }).unwrap();
    assert!(
        consumed < ticks_per_second / 4,
        "blocked bridge consumed {consumed} CPU ticks"
    );
    process.signal(libc::SIGTERM);
    assert_eq!(process.wait(Duration::from_secs(2)).code(), Some(143));
    fixture.finish();
}

#[test]
fn idle_bridge_sends_the_original_five_second_heartbeat() {
    let (sent, received) = mpsc::channel();
    let mut fixture = Server::new(move |mut socket| {
        admit(&mut socket);
        sent.send(read_frame(&mut socket).unwrap()).unwrap();
        let mut rest = Vec::new();
        let _ = socket.read_to_end(&mut rest);
    });
    let mut process = Process::start(&fixture.helper);
    assert!(
        received
            .recv_timeout(Duration::from_secs(7))
            .unwrap()
            .is_empty()
    );
    process.signal(libc::SIGTERM);
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(143));
    fixture.finish();
}

#[test]
fn queued_eof_does_not_hide_bootstrap_refusal() {
    let directory = Directory::new();
    let helper = directory
        .helper("printf 'configured\\n' >&3\ndd bs=1 count=1 >/dev/null 2>/dev/null\nexit 1");
    let mut process = Process::start(&helper);
    process
        .0
        .stdin
        .take()
        .unwrap()
        .write_all(b"opaque request\n")
        .unwrap();
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(1));
}

#[test]
fn closed_stdout_is_a_write_failure_not_sigpipe() {
    let mut fixture = Server::new(|mut socket| {
        admit(&mut socket);
        write_frame(&mut socket, b"opaque reply").unwrap();
    });
    let mut process = Process::start(&fixture.helper);
    process.0.stdout.take();
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(1));
    let mut diagnostic = String::new();
    process
        .0
        .stderr
        .as_mut()
        .unwrap()
        .read_to_string(&mut diagnostic)
        .unwrap();
    assert!(diagnostic.contains("Stdio output failed"));
    fixture.finish();
}

#[test]
fn missing_helper_is_terminal() {
    let mut process = Process::start(Path::new("/does-not-exist"));
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(1));
}

#[test]
fn public_socket_directory_is_refused() {
    let mut fixture = Server::new(|_| panic!("insecure socket must not be contacted"));
    fs::set_permissions(&fixture.directory.0, fs::Permissions::from_mode(0o755)).unwrap();
    let mut process = Process::start(&fixture.helper);
    process
        .0
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"queued\n")
        .unwrap();
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(1));
    fixture.finish();
}

#[test]
fn socket_symlink_is_refused() {
    let mut fixture = Server::new(|_| panic!("socket symlink must not be contacted"));
    let socket = fixture.directory.0.join("s");
    let actual = fixture.directory.0.join("actual");
    fs::rename(&socket, &actual).unwrap();
    std::os::unix::fs::symlink(&actual, &socket).unwrap();
    let mut process = Process::start(&fixture.helper);
    process
        .0
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"queued\n")
        .unwrap();
    assert_eq!(process.wait(Duration::from_secs(5)).code(), Some(1));
    fixture.finish();
}

#[test]
fn bootstrap_overrides_the_inherited_transport() {
    let directory = Directory::new();
    let helper = directory.helper("[ \"$MCP_TRANSPORT\" = resident-bootstrap ] || exit 1\n[ \"$HULY_PROFILE\" = work ] || exit 1\nprintf 'local\\n' >&3\nexec 3>&-\nexec cat");
    let mut process = Process(
        Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
            .args([helper.as_os_str(), "unused".as_ref()])
            .env("MCP_TRANSPORT", "stdio-resident")
            .env("HULY_PROFILE", "work")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    process
        .0
        .stdin
        .take()
        .unwrap()
        .write_all(b"opaque request\n")
        .unwrap();
    let mut reply = String::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut reply)
        .unwrap();
    assert_eq!(reply, "opaque request\n");
    assert!(process.wait(Duration::from_secs(5)).success());
}

#[test]
fn startup_deadline_joins_the_helper_and_falls_back_without_losing_buffered_input() {
    let directory = Directory::new();
    let pid_file = directory.0.join("bootstrap.pid");
    let helper = directory.helper(&format!(
        "if [ \"$MCP_TRANSPORT\" = stdio ]; then exec cat; fi\nprintf '%s' \"$$\" > '{}'\nexec sleep 20",
        pid_file.display()
    ));
    let started = Instant::now();
    let mut process = Process(
        Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
            .args([helper.as_os_str(), "unused".as_ref(), "1000".as_ref()])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    process
        .0
        .stdin
        .take()
        .unwrap()
        .write_all(b"queued request\n")
        .unwrap();
    let mut output = String::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    assert!(process.wait(Duration::from_secs(2)).success());
    assert_eq!(output, "queued request\n");
    let pid: i32 = fs::read_to_string(pid_file).unwrap().parse().unwrap();
    // SAFETY: signal zero only checks whether this fixture's joined helper still exists.
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH));
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[test]
fn thirty_second_startup_allowance_is_accepted() {
    let directory = Directory::new();
    let helper = directory.helper("printf 'local\\n' >&3\nexec 3>&-\nexec cat");
    let mut process = Process(
        Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
            .args([helper.as_os_str(), "unused".as_ref(), "30000".as_ref()])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    process
        .0
        .stdin
        .take()
        .unwrap()
        .write_all(b"request\n")
        .unwrap();
    let mut output = String::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    assert!(process.wait(Duration::from_secs(2)).success());
    assert_eq!(output, "request\n");
}

#[test]
fn failed_bootstrap_falls_back_and_preserves_all_input_bytes() {
    let directory = Directory::new();
    let helper = directory.helper("if [ \"$MCP_TRANSPORT\" = stdio ]; then exec cat; fi\nexit 7");
    let mut process = Process::start(&helper);
    let payload = b"{\"id\":1}\n".repeat(30_000);
    let expected = payload.clone();
    let mut input = process.0.stdin.take().unwrap();
    let sender = thread::spawn(move || input.write_all(&payload).unwrap());
    let mut output = Vec::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_end(&mut output)
        .unwrap();
    sender.join().unwrap();
    assert!(process.wait(Duration::from_secs(2)).success());
    assert_eq!(output, expected);
}

fn fallback_echo(fixture: &Server) {
    let original = fs::read_to_string(&fixture.helper).unwrap();
    fs::write(
        &fixture.helper,
        format!("#!/bin/sh\nif [ \"$MCP_TRANSPORT\" = stdio ]; then exec cat; fi\n{original}"),
    )
    .unwrap();
}

#[test]
fn failed_admission_falls_back_before_sending_any_mcp_input() {
    let mut fixture = Server::new(|mut socket| {
        let mut hello = String::new();
        BufReader::new(&mut socket).read_line(&mut hello).unwrap();
        socket.write_all(&[0]).unwrap();
        assert_eq!(socket.read(&mut [0]).unwrap(), 0);
    });
    fallback_echo(&fixture);
    let mut process = Process::start(&fixture.helper);
    process
        .0
        .stdin
        .take()
        .unwrap()
        .write_all(b"queued request\n")
        .unwrap();
    let mut output = String::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    assert!(process.wait(Duration::from_secs(2)).success());
    assert_eq!(output, "queued request\n");
    fixture.finish();
}

#[test]
fn active_resident_failure_does_not_fall_back_or_replay_input() {
    let mut fixture = Server::new(|mut socket| {
        admit(&mut socket);
        assert_eq!(read_frame(&mut socket).unwrap(), b"request\n");
        write_frame(&mut socket, b"response\n").unwrap();
    });
    fallback_echo(&fixture);
    let mut process = Process::start(&fixture.helper);
    process
        .0
        .stdin
        .as_mut()
        .unwrap()
        .write_all(b"request\n")
        .unwrap();
    let mut output = String::new();
    process
        .0
        .stdout
        .as_mut()
        .unwrap()
        .read_to_string(&mut output)
        .unwrap();
    assert_eq!(process.wait(Duration::from_secs(2)).code(), Some(1));
    assert!(output.is_empty() || output == "response\n");
    let mut diagnostic = String::new();
    process
        .0
        .stderr
        .as_mut()
        .unwrap()
        .read_to_string(&mut diagnostic)
        .unwrap();
    assert!(!diagnostic.contains("starting ordinary stdio"));
    fixture.finish();
}
