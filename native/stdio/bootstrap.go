//go:build linux || darwin

package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type bootstrap struct {
	path  string
	hello []byte
}

func bootstrapEnvironment(environment []string) []string {
	result := make([]string, 0, len(environment)+1)
	for _, entry := range environment {
		if !strings.HasPrefix(entry, "MCP_TRANSPORT=") {
			result = append(result, entry)
		}
	}
	return append(result, "MCP_TRANSPORT=resident-bootstrap")
}

type preparedLaunch interface{ close() }
type residentLaunch struct {
	bootstrap
	helper *localLaunch
}

func (launch residentLaunch) close() { clear(launch.hello); launch.helper.close() }

type localLaunch struct {
	command *exec.Cmd
	input   io.WriteCloser
	output  io.ReadCloser
	cancel  context.CancelFunc
	joined  sync.Once
	waitErr error
}

func (launch *localLaunch) wait() error {
	launch.joined.Do(func() { launch.waitErr = launch.command.Wait() })
	return launch.waitErr
}
func (launch *localLaunch) close() {
	launch.cancel()
	launch.input.Close()
	launch.output.Close()
	launch.wait()
}

var errInputClosed = errors.New("native input closed before startup permission")

func prepare(ctx context.Context, node, bundle string, allowConfigured func() bool) (preparedLaunch, error) {
	control, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer control.Close()
	childCtx, cancel := context.WithCancel(ctx)
	stopControl := context.AfterFunc(childCtx, func() { control.Close() })
	defer stopControl()
	command := exec.CommandContext(childCtx, node, bundle)
	command.Cancel = func() error { return command.Process.Signal(syscall.SIGTERM) }
	command.WaitDelay = 5 * time.Second
	command.Env = bootstrapEnvironment(os.Environ())
	command.ExtraFiles = []*os.File{writer}
	command.Stderr = os.Stderr
	input, err := command.StdinPipe()
	if err != nil {
		writer.Close()
		cancel()
		return nil, err
	}
	output, err := command.StdoutPipe()
	if err != nil {
		input.Close()
		writer.Close()
		cancel()
		return nil, err
	}
	if err = command.Start(); err != nil {
		input.Close()
		output.Close()
		writer.Close()
		cancel()
		return nil, err
	}
	writer.Close()
	local := &localLaunch{command: command, input: input, output: output, cancel: cancel}
	transferred := false
	defer func() {
		if !transferred {
			local.close()
		}
	}()
	reader := bufio.NewReaderSize(control, NATIVE_CONTROL_BYTES+1)
	header, err := reader.ReadSlice('\n')
	if err != nil {
		return nil, err
	}
	if string(header) == NATIVE_LOCAL_HEADER+"\n" {
		transferred = true
		return local, nil
	}
	if string(header) != NATIVE_CONFIGURED_HEADER+"\n" {
		return nil, errors.New("unknown bootstrap decision")
	}
	if !allowConfigured() {
		return nil, errInputClosed
	}
	if err = writeAll(input, []byte{NATIVE_ACK}); err != nil {
		return nil, err
	}
	header, err = reader.ReadSlice('\n')
	if err != nil {
		return nil, err
	}
	prefix := bytes.Clone(header)
	rest, err := io.ReadAll(io.LimitReader(reader, int64(NATIVE_CONTROL_BYTES+1-len(prefix))))
	if err != nil {
		return nil, err
	}
	info, err := parseBootstrap(append(prefix, rest...))
	if err != nil {
		return nil, err
	}
	transferred = true
	return residentLaunch{info, local}, nil
}

func parseBootstrap(frame []byte) (bootstrap, error) {
	if len(frame) > NATIVE_CONTROL_BYTES {
		return bootstrap{}, errors.New("control budget")
	}
	path, rest, ok := bytes.Cut(frame, []byte{'\n'})
	if !ok || len(rest) < 2 || rest[len(rest)-1] != '\n' || bytes.Contains(rest[:len(rest)-1], []byte{'\n'}) {
		return bootstrap{}, errors.New("control frame")
	}
	parsed := string(path)
	if !filepath.IsAbs(parsed) || filepath.Clean(parsed) != parsed || len(path) >= NATIVE_PATH_BYTES || bytes.ContainsAny(path, "\x00\r") {
		return bootstrap{}, errors.New("socket path")
	}
	return bootstrap{path: parsed, hello: rest}, nil
}

func privateSocket(path string) error {
	for _, item := range []struct {
		path   string
		socket bool
	}{{filepath.Dir(path), false}, {path, true}} {
		stat, err := os.Lstat(item.path)
		if err != nil {
			return err
		}
		owner, ok := stat.Sys().(*syscall.Stat_t)
		if !ok || owner.Uid != uint32(os.Geteuid()) {
			return errors.New("socket owner")
		}
		if item.socket {
			if stat.Mode()&os.ModeSocket == 0 || stat.Mode().Perm() != 0600 {
				return errors.New("socket mode")
			}
		} else if !stat.IsDir() || stat.Mode().Perm() != 0700 {
			return errors.New("directory mode")
		}
	}
	return nil
}

func connect(ctx context.Context, info bootstrap) (*net.UnixConn, error) {
	if err := privateSocket(info.path); err != nil {
		return nil, err
	}
	dialer := net.Dialer{}
	socket, err := dialer.DialContext(ctx, "unix", info.path)
	if err != nil {
		return nil, err
	}
	conn, ok := socket.(*net.UnixConn)
	if !ok {
		socket.Close()
		return nil, errors.New("socket transport")
	}
	failed := true
	defer func() {
		if failed {
			conn.Close()
		}
	}()
	if deadline, ok := ctx.Deadline(); ok {
		if err = conn.SetDeadline(deadline); err != nil {
			return nil, err
		}
	}
	if err = writeAll(conn, info.hello); err != nil {
		return nil, err
	}
	clear(info.hello)
	var ack [1]byte
	if _, err = io.ReadFull(conn, ack[:]); err != nil {
		return nil, err
	}
	if ack[0] != NATIVE_ACK {
		return nil, errors.New("admission refused")
	}
	if err = conn.SetDeadline(time.Time{}); err != nil {
		return nil, err
	}
	failed = false
	return conn, nil
}
