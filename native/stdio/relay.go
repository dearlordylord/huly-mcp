//go:build linux || darwin

package main

import (
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

const relayChunkBytes = NATIVE_FRAME_BYTES
const relayQueuedChunks = 4

var errOutput = errors.New("native stdout failed")

func pumpInput(ctx context.Context, input io.Reader) (<-chan []byte, <-chan error, *atomic.Bool) {
	closed := new(atomic.Bool)
	chunks := make(chan []byte, relayQueuedChunks)
	ended := make(chan error, 1)
	go func() {
		defer close(chunks)
		for {
			chunk := make([]byte, relayChunkBytes)
			n, err := input.Read(chunk)
			if n > 0 {
				select {
				case chunks <- chunk[:n]:
				case <-ctx.Done():
					ended <- ctx.Err()
					return
				}
			}
			if err != nil {
				closed.Store(true)
				ended <- err
				return
			}
		}
	}()
	return chunks, ended, closed
}

func writeAll(output io.Writer, data []byte) error {
	for len(data) > 0 {
		n, err := output.Write(data)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		data = data[n:]
	}
	return nil
}

func relay(ctx context.Context, conn *net.UnixConn, chunks <-chan []byte, ended <-chan error, input, output *os.File) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	finished := make(chan error, 2)
	var writers sync.WaitGroup
	writers.Add(2)
	go func() {
		defer writers.Done()
		_, err := copyNativeFrames(output, conn)
		if err == nil {
			err = io.EOF
		}
		finished <- err
	}()
	go func() {
		defer writers.Done()
		ticker := time.NewTicker(time.Duration(NATIVE_HEARTBEAT_MILLIS) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := writeFrame(conn, nil); err != nil {
					finished <- err
					return
				}
			case chunk, ok := <-chunks:
				if !ok {
					return
				}
				if err := writeFrame(conn, chunk); err != nil {
					finished <- err
					return
				}
			}
		}
	}()
	var result error
	select {
	case err := <-ended:
		if !errors.Is(err, io.EOF) {
			result = err
		}
	case <-ctx.Done():
	case result = <-finished:
	}
	interrupted := ctx.Err() != nil
	cancel()
	conn.Close()
	input.Close()
	output.Close()
	writers.Wait()
	if interrupted {
		return nil
	}
	return result
}

func writeFrame(output io.Writer, data []byte) error {
	var header [NATIVE_FRAME_HEADER_BYTES]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(data)))
	if err := writeAll(output, header[:]); err != nil {
		return err
	}
	return writeAll(output, data)
}

func copyNativeOutput(output *os.File, input io.Reader) (int64, error) {
	var total int64
	buffer := make([]byte, relayChunkBytes)
	for {
		n, err := input.Read(buffer)
		if n > 0 {
			if deadlineErr := output.SetWriteDeadline(time.Now().Add(time.Duration(NATIVE_OUTPUT_MILLIS) * time.Millisecond)); deadlineErr != nil {
				stat, statErr := output.Stat()
				if statErr != nil || !stat.Mode().IsRegular() {
					return total, errors.Join(errOutput, deadlineErr)
				}
			}
			if writeErr := writeAll(output, buffer[:n]); writeErr != nil {
				return total, errors.Join(errOutput, writeErr)
			}
			total += int64(n)
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return total, nil
			}
			return total, err
		}
	}
}

func copyNativeFrames(output *os.File, input io.Reader) (int64, error) {
	var total int64
	for {
		var header [NATIVE_FRAME_HEADER_BYTES]byte
		if _, err := io.ReadFull(input, header[:]); err != nil {
			return total, err
		}
		encoded := binary.BigEndian.Uint32(header[:])
		diagnostic := encoded&NATIVE_DIAGNOSTIC_FLAG != 0
		size := encoded & ^uint32(NATIVE_DIAGNOSTIC_FLAG)
		if size > NATIVE_FRAME_BYTES {
			return total, errors.New("backend frame budget")
		}
		if diagnostic {
			message := make([]byte, size)
			if _, err := io.ReadFull(input, message); err != nil {
				return total, err
			}
			writeAll(os.Stderr, append(message, '\n'))
			return total, errors.New("backend refused native session")
		}
		copied, err := copyNativeOutput(output, io.LimitReader(input, int64(size)))
		total += copied
		if err != nil {
			return total, err
		}
		if copied != int64(size) {
			return total, io.ErrUnexpectedEOF
		}
	}
}
