//go:build linux || darwin

package main

import (
	"context"
	"errors"
	"io"
	"os"
	"sync"
)

// Local NoConfig/diagnostic stdio drains its final replies on EOF, unlike an admitted resident attachment.
func relayLocal(ctx context.Context, child *localLaunch, chunks <-chan []byte, ended <-chan error, input, output *os.File) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	replies := make(chan error, 1)
	writes := make(chan error, 1)
	var workers sync.WaitGroup
	workers.Add(2)
	go func() { defer workers.Done(); _, err := io.Copy(output, child.output); replies <- err }()
	go func() {
		defer workers.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case chunk, ok := <-chunks:
				if !ok {
					child.input.Close()
					return
				}
				if err := writeAll(child.input, chunk); err != nil {
					writes <- err
					return
				}
			}
		}
	}()
	var result error
	finished := false
	for !finished {
		select {
		case err := <-ended:
			if !errors.Is(err, io.EOF) {
				result = err
				finished = true
			}
		case result = <-writes:
			finished = true
		case <-ctx.Done():
			finished = true
		case result = <-replies:
			if result == nil {
				result = child.wait()
			}
			finished = true
		}
	}
	interrupted := ctx.Err() != nil
	cancel()
	input.Close()
	output.Close()
	child.close()
	workers.Wait()
	if interrupted {
		return nil
	}
	return result
}
