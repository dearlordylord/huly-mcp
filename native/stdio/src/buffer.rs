use crate::{BridgeError, Result, wire::*};
use std::collections::VecDeque;
use std::io::{self, Read, Write};
use std::time::{Duration, Instant};

const QUEUED_CHUNKS: usize = 4;

pub fn retryable(error: &BridgeError) -> bool {
    matches!(error, BridgeError::Io(cause) if matches!(cause.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted))
}

pub struct Queue {
    chunks: VecDeque<Vec<u8>>,
    offset: usize,
    deadline: Option<Instant>,
}

impl Queue {
    pub fn new() -> Self {
        Self {
            chunks: VecDeque::new(),
            offset: 0,
            deadline: None,
        }
    }
    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }
    pub fn has_capacity(&self) -> bool {
        self.chunks.len() < QUEUED_CHUNKS
    }
    pub fn push(&mut self, bytes: Vec<u8>) {
        if bytes.is_empty() {
            return;
        }
        if self.chunks.is_empty() {
            self.deadline = Some(Instant::now() + Duration::from_millis(NATIVE_OUTPUT_MILLIS));
        }
        self.chunks.push_back(bytes);
    }
    pub fn write_to(&mut self, output: &mut impl Write) -> Result<()> {
        let Some(chunk) = self.chunks.front() else {
            return Ok(());
        };
        match output.write(&chunk[self.offset..]) {
            Ok(0) => return Err(io::ErrorKind::WriteZero.into()),
            Ok(size) => self.offset += size,
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
        if self.offset == chunk.len() {
            self.chunks.pop_front();
            self.offset = 0;
            self.deadline = (!self.chunks.is_empty())
                .then(|| Instant::now() + Duration::from_millis(NATIVE_OUTPUT_MILLIS));
        }
        Ok(())
    }
    pub fn check_output_deadline(&self) -> Result<()> {
        if self
            .deadline
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            return Err(BridgeError::Output);
        }
        Ok(())
    }
    pub fn pop(&mut self) -> Option<Vec<u8>> {
        debug_assert_eq!(self.offset, 0);
        let bytes = self.chunks.pop_front();
        if self.chunks.is_empty() {
            self.deadline = None;
        }
        bytes
    }
}

pub struct Input {
    pub queue: Queue,
    pub closed: bool,
    scratch: Vec<u8>,
}

impl Input {
    pub fn new() -> Self {
        Self {
            queue: Queue::new(),
            closed: false,
            scratch: vec![0; NATIVE_FRAME_BYTES],
        }
    }
    pub fn read(&mut self, source: &mut impl Read) -> Result<()> {
        if self.closed || !self.queue.has_capacity() {
            return Ok(());
        }
        match source.read(&mut self.scratch) {
            Ok(0) => self.closed = true,
            Ok(size) => self.queue.push(self.scratch[..size].to_vec()),
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                ) => {}
            Err(error) => return Err(error.into()),
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn input_read_error_is_not_treated_as_eof() {
        let mut directory = std::fs::File::open(std::env::temp_dir()).unwrap();
        let mut input = Input::new();
        assert!(input.read(&mut directory).is_err());
        assert!(!input.closed);
        assert!(input.queue.is_empty());
    }
}
