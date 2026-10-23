#![deny(unsafe_op_in_unsafe_fn)]

mod bootstrap;
mod buffer;
mod metadata;
mod metadata_replay;
mod os;
mod startup;
mod transport;
mod wire;

use std::ffi::OsString;
use std::fs::File;
use std::io;
use std::os::fd::FromRawFd;
use std::time::{Duration, Instant};

#[derive(Debug)]
enum BridgeError {
    Io(io::Error),
    Control,
    Startup,
    Helper,
    Output,
}
type Result<T> = std::result::Result<T, BridgeError>;
impl From<io::Error> for BridgeError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
impl From<io::ErrorKind> for BridgeError {
    fn from(error: io::ErrorKind) -> Self {
        Self::Io(error.into())
    }
}

fn startup_budget(arguments: &[OsString]) -> Result<Duration> {
    if !(2..=3).contains(&arguments.len()) {
        return Err(BridgeError::Control);
    }
    let millis = match arguments.get(2) {
        None => wire::NATIVE_STARTUP_MILLIS,
        Some(value) => value
            .to_str()
            .and_then(|text| text.parse::<u64>().ok())
            .ok_or(BridgeError::Control)?,
    };
    if millis == 0 || millis > wire::NATIVE_STARTUP_MILLIS {
        return Err(BridgeError::Control);
    }
    Ok(Duration::from_millis(millis))
}

fn run(arguments: &[OsString]) -> Result<()> {
    let deadline = Instant::now() + startup_budget(arguments)?;
    os::nonblocking(0)?;
    os::nonblocking(1)?;
    // SAFETY: this executable exclusively owns stdin/stdout and never constructs other owners.
    let (mut source, mut output) = unsafe { (File::from_raw_fd(0), File::from_raw_fd(1)) };
    let mut input = buffer::Input::new();
    let mut metadata = metadata::Metadata::new(&arguments[0], &arguments[1]);
    let prepared = (|| {
        // Prioritize already-buffered protocol discovery over another Node startup.
        metadata.read(&mut source, &mut input)?;
        metadata.ready(&mut input, &mut source, &mut output, deadline)?;
        let helper = bootstrap::Helper::start(&arguments[0], &arguments[1])?;
        startup::prepare(
            helper,
            &mut input,
            &mut source,
            &mut output,
            &mut metadata,
            deadline,
        )
    })();
    match prepared {
        Ok(startup::Launch::Closed) => Ok(()),
        Ok(startup::Launch::Local(helper)) => transport::local(
            metadata.local(&mut input, Some(helper))?,
            &mut input,
            &mut source,
            &mut output,
            metadata.take_output(),
        ),
        Ok(startup::Launch::Resident(socket)) => {
            drop(metadata);
            transport::resident(socket, &mut input, &mut source, &mut output)
        }
        Err(_) if os::signal_status().is_none() => {
            // Only protocol metadata has run; application input is still owned by this queue.
            eprintln!("Native resident startup failed; starting ordinary stdio");
            let helper = metadata.local(&mut input, None)?;
            transport::local(
                helper,
                &mut input,
                &mut source,
                &mut output,
                metadata.take_output(),
            )
        }
        Err(error) => Err(error),
    }
}

fn main() {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    if arguments.len() == 1 && arguments[0] == wire::NATIVE_CHECK_ARGUMENT {
        return;
    }
    let result = os::install_signals()
        .map_err(BridgeError::from)
        .and_then(|()| run(&arguments));
    if let Some(status) = os::signal_status() {
        std::process::exit(status);
    }
    if let Err(error) = result {
        if matches!(error, BridgeError::Output) {
            eprintln!("Stdio output failed or exceeded its 10 second write allowance");
        }
        eprintln!(
            "Native resident channel failed; an in-flight operation outcome may be unknown. No request was replayed."
        );
        std::process::exit(1);
    }
}
