use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::sync::atomic::{AtomicI32, Ordering};
use std::time::Duration;

static SIGNAL: AtomicI32 = AtomicI32::new(0);

extern "C" fn record_signal(signal: libc::c_int) {
    SIGNAL.store(signal, Ordering::Relaxed);
}

pub fn install_signals() -> io::Result<()> {
    // libc represents handlers as an integer-sized address on the supported Unix targets.
    // SAFETY: the extern-C handler only stores a lock-free atomic; no allocation, locks or I/O.
    unsafe {
        for signal in [libc::SIGINT, libc::SIGTERM, libc::SIGHUP] {
            if libc::signal(signal, record_signal as *const () as libc::sighandler_t)
                == libc::SIG_ERR
            {
                return Err(io::Error::last_os_error());
            }
        }
        if libc::signal(libc::SIGPIPE, libc::SIG_IGN) == libc::SIG_ERR {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

pub fn signal_status() -> Option<i32> {
    match SIGNAL.load(Ordering::Relaxed) {
        0 => None,
        signal => Some(128 + signal),
    }
}

pub fn nonblocking(fd: RawFd) -> io::Result<()> {
    // SAFETY: fcntl operates on a borrowed descriptor without transferring ownership.
    unsafe {
        let flags = libc::fcntl(fd, libc::F_GETFL);
        if flags < 0 || libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) < 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

pub fn control_pipe() -> io::Result<(OwnedFd, OwnedFd)> {
    let mut fds = [-1; 2];
    // SAFETY: pipe initializes two descriptors in the supplied two-element array.
    if unsafe { libc::pipe(fds.as_mut_ptr()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: successful pipe returned two new descriptors; each is owned exactly once.
    let (reader, writer) = unsafe { (OwnedFd::from_raw_fd(fds[0]), OwnedFd::from_raw_fd(fds[1])) };
    for fd in [&reader, &writer] {
        // SAFETY: the descriptors remain owned here; FD_CLOEXEC affects only inheritance.
        if unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) } < 0 {
            return Err(io::Error::last_os_error());
        }
    }
    nonblocking(reader.as_raw_fd())?;
    Ok((reader, writer))
}

pub fn inherit_control(source: RawFd, destination: RawFd) -> io::Result<()> {
    // SAFETY: called after fork before exec with the live owned pipe descriptor.
    // dup2 is async-signal-safe; clearing CLOEXEC also handles source == destination.
    unsafe {
        if libc::dup2(source, destination) < 0 || libc::fcntl(destination, libc::F_SETFD, 0) < 0 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

pub fn terminate(pid: u32) {
    if let Ok(pid) = libc::pid_t::try_from(pid) {
        // SAFETY: the caller still owns this unreaped child, so its PID cannot be reused.
        unsafe { libc::kill(pid, libc::SIGTERM) };
    }
}

pub struct Interest {
    descriptor: libc::pollfd,
}

impl Interest {
    pub fn new(fd: RawFd, read: bool, write: bool) -> Self {
        Self {
            descriptor: libc::pollfd {
                fd,
                events: if read { libc::POLLIN } else { 0 } | if write { libc::POLLOUT } else { 0 },
                revents: 0,
            },
        }
    }
}

pub fn wait(interests: &[Interest], timeout: Duration) -> io::Result<()> {
    let mut descriptors: Vec<_> = interests.iter().map(|item| item.descriptor).collect();
    let millis = i32::try_from(timeout.as_millis()).unwrap_or(i32::MAX);
    let count = descriptors
        .len()
        .try_into()
        .map_err(|_| io::Error::other("poll descriptor limit"))?;
    // SAFETY: the vector contains initialized pollfd entries and lives throughout poll.
    let result = unsafe { libc::poll(descriptors.as_mut_ptr(), count, millis) };
    if result < 0 {
        let error = io::Error::last_os_error();
        if error.kind() != io::ErrorKind::Interrupted {
            return Err(error);
        }
    }
    Ok(())
}
