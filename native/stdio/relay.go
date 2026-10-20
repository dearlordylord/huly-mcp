//go:build linux || darwin

package main

import (
	"context"
	"errors"
	"io"
	"net"
	"os"
	"sync"
	"sync/atomic"
)

const relayChunkBytes = 64 * 1024
const relayQueuedChunks = 4

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
		_, err := io.Copy(output, conn)
		if err == nil {
			err = io.EOF
		}
		finished <- err
	}()
	go func() {
		defer writers.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case chunk, ok := <-chunks:
				if !ok {
					return
				}
				if err := writeAll(conn, chunk); err != nil {
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
