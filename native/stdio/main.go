//go:build linux || darwin

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"
)

func main() {
	runtime.GOMAXPROCS(1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer signal.Stop(signals)
	var signalStatus atomic.Int32
	go func() {
		select {
		case value := <-signals:
			if received, ok := value.(syscall.Signal); ok {
				signalStatus.Store(int32(128 + received))
			} else {
				signalStatus.Store(1)
			}
			cancel()
		case <-ctx.Done():
		}
	}()
	output, err := pollableOutput(os.Stdout)
	if err == nil {
		err = run(ctx, os.Args[1:], os.Stdin, output)
	}
	if status := signalStatus.Load(); status != 0 {
		os.Exit(int(status))
	}
	if err != nil {
		if errors.Is(err, os.ErrDeadlineExceeded) {
			fmt.Fprintln(os.Stderr, "Stdio output failed or exceeded its 10 second write allowance")
		}
		fmt.Fprintln(os.Stderr, "Native resident channel failed; in-flight outcomes may be unknown. No request was replayed.")
		os.Exit(1)
	}
}

func startupBudget(args []string) (time.Duration, error) {
	if len(args) != 2 && len(args) != 3 {
		return 0, errors.New("invalid launcher")
	}
	budget := NATIVE_STARTUP_MILLIS
	if len(args) == 3 {
		parsed, err := strconv.Atoi(args[2])
		if err != nil {
			return 0, err
		}
		budget = parsed
	}
	if budget <= 0 || budget > NATIVE_STARTUP_MILLIS {
		return 0, errors.New("startup budget")
	}
	return time.Duration(budget) * time.Millisecond, nil
}

func run(ctx context.Context, args []string, input, output *os.File) error {
	defer input.Close()
	defer output.Close()
	budget, err := startupBudget(args)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	chunks, ended, inputClosed := pumpInput(ctx, input)
	var configured atomic.Bool
	startup, stop := context.WithTimeout(ctx, budget)
	defer stop()
	type outcome struct {
		launch preparedLaunch
		err    error
	}
	ready := make(chan outcome, 1)
	go func() {
		launch, err := prepare(ctx, args[0], args[1], func() bool { configured.Store(true); return !inputClosed.Load() })
		ready <- outcome{launch, err}
	}()
	var launch preparedLaunch
	watchEnd := ended
	for launch == nil {
		select {
		case inputErr := <-watchEnd:
			if errors.Is(inputErr, io.EOF) && !configured.Load() {
				replay := make(chan error, 1)
				replay <- inputErr
				ended = replay
				watchEnd = nil
				continue
			}
			cancel()
			input.Close()
			result := <-ready
			if result.launch != nil {
				result.launch.close()
			}
			if !errors.Is(inputErr, io.EOF) {
				return inputErr
			}
			return nil
		case <-ctx.Done():
			input.Close()
			result := <-ready
			if result.launch != nil {
				result.launch.close()
			}
			return nil
		case <-startup.Done():
			cancel()
			input.Close()
			result := <-ready
			if result.launch != nil {
				result.launch.close()
			}
			return startup.Err()
		case result := <-ready:
			if ctx.Err() != nil {
				if result.launch != nil {
					result.launch.close()
				}
				return nil
			}
			if result.err != nil {
				if errors.Is(result.err, errInputClosed) {
					return nil
				}
				return result.err
			}
			launch = result.launch
		}
	}

	defer launch.close()
	switch selected := launch.(type) {
	case *localLaunch:
		stop()
		return relayLocal(ctx, selected, chunks, ended, input, output)
	case residentLaunch:
		conn, err := connect(startup, selected.bootstrap)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		defer conn.Close()
		if err = writeAll(selected.helper.input, []byte(NATIVE_ATTACHED_HEADER+"\n")); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		joined := make(chan error, 1)
		go func() { joined <- selected.helper.wait() }()
		select {
		case err = <-joined:
			if ctx.Err() != nil {
				return nil
			}
			if err != nil {
				return err
			}
		case <-startup.Done():
			selected.helper.cancel()
			<-joined
			if ctx.Err() != nil {
				return nil
			}
			return startup.Err()
		}
		stop()
		return relay(ctx, conn, chunks, ended, input, output)
	default:
		return errors.New("invalid bootstrap decision")
	}
}

func pollableOutput(output *os.File) (*os.File, error) {
	stat, err := output.Stat()
	if err != nil {
		return nil, err
	}
	if stat.Mode().IsRegular() {
		return output, nil
	}
	fd := output.Fd()
	if err = syscall.SetNonblock(int(fd), true); err != nil {
		return nil, err
	}
	return os.NewFile(fd, output.Name()), nil
}
