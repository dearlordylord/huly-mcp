//go:build linux || darwin

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func fixture(t *testing.T, action func(*net.UnixConn)) (string, string) {
	t.Helper()
	dir, err := os.MkdirTemp("", "huly-native-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	dir, err = filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "s")
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	go func() {
		conn, err := listener.AcceptUnix()
		if err == nil {
			defer conn.Close()
			action(conn)
		}
	}()
	helper := filepath.Join(dir, "node-helper")
	script := "#!/bin/sh\nprintf 'configured\\n' >&3\ndd bs=1 count=1 >/dev/null 2>/dev/null\nprintf '%s\\n' '" + path + "' '{\"proof\":\"opaque\"}' >&3\nexec 3>&-\nread attached\n[ \"$attached\" = attached ]\n"
	if err = os.WriteFile(helper, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	return helper, path
}

func ownPipes(t *testing.T) (*os.File, *os.File, *os.File, *os.File) {
	t.Helper()
	input, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	reader, output, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { input.Close(); writer.Close(); reader.Close(); output.Close() })
	return input, writer, reader, output
}

func TestRelayPreservesFramingAndBackpressure(t *testing.T) {
	handshake := make(chan string, 1)
	helper, _ := fixture(t, func(conn *net.UnixConn) {
		r := bufio.NewReader(conn)
		hello, _ := r.ReadString('\n')
		handshake <- hello
		conn.Write([]byte{1})
		for {
			frame, err := readTestFrame(r)
			if err != nil {
				return
			}
			if err = writeFrame(conn, frame); err != nil {
				return
			}
		}
	})
	input, writer, reader, output := ownPipes(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{helper, "unused", "5000"}, input, output) }()
	payload := bytes.Repeat([]byte("{\"id\":42,\"method\":\"ping\"}\n"), 10000)
	sent := make(chan error, 1)
	go func() { sent <- writeAll(writer, payload) }()
	received := make([]byte, len(payload))
	if _, err := io.ReadFull(reader, received); err != nil {
		t.Fatalf("reply: %v; run: %v", err, <-done)
	}
	if !bytes.Equal(payload, received) {
		t.Fatal("stdio byte order/framing changed")
	}
	if err := <-sent; err != nil {
		t.Fatal(err)
	}
	if hello := <-handshake; hello != "{\"proof\":\"opaque\"}\n" {
		t.Fatal("private control frame changed")
	}
	writer.Close()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("relay cleanup did not join")
	}
}

func TestBackendLossFailsClosedWithoutReconnect(t *testing.T) {
	request := make(chan string, 1)
	helper, _ := fixture(t, func(conn *net.UnixConn) {
		r := bufio.NewReader(conn)
		r.ReadString('\n')
		conn.Write([]byte{1})
		frame, _ := readTestFrame(r)
		request <- string(frame)
	})
	input, writer, _, output := ownPipes(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{helper, "unused", "5000"}, input, output) }()
	writer.WriteString("{\"id\":7,\"method\":\"tools/call\"}\n")
	if got := <-request; got != "{\"id\":7,\"method\":\"tools/call\"}\n" {
		t.Fatal("request changed")
	}
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("backend loss silently succeeded")
		}
	case <-ctx.Done():
		t.Fatal("backend loss did not stop native adapter")
	}
}

func TestCancellationClosesNativeSession(t *testing.T) {
	connected := make(chan struct{})
	helper, _ := fixture(t, func(conn *net.UnixConn) {
		bufio.NewReader(conn).ReadString('\n')
		conn.Write([]byte{1})
		close(connected)
		io.Copy(io.Discard, conn)
	})
	input, _, _, output := ownPipes(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{helper, "unused", "5000"}, input, output) }()
	<-connected
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("signal cleanup did not join")
	}
}

func TestLocalFallbackDrainsBufferedInputAndOutput(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "local-helper")
	if err := os.WriteFile(helper, []byte("#!/bin/sh\nprintf 'local\\n' >&3\nexec cat\n"), 0700); err != nil {
		t.Fatal(err)
	}
	input, writer, reader, output := ownPipes(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{helper, "unused"}, input, output) }()
	payload := bytes.Repeat([]byte("{\"id\":99,\"method\":\"tools/list\"}\n"), 10000)
	go func() { writeAll(writer, payload); writer.Close() }()
	result, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(result, payload) {
		t.Fatal("local fallback lost buffered bytes on EOF")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestLocalFallbackPreservesRequestQueuedBeforeBootstrapEOF(t *testing.T) {
	dir := t.TempDir()
	helper := filepath.Join(dir, "local-helper")
	if err := os.WriteFile(helper, []byte("#!/bin/sh\nprintf 'local\\n' >&3\nexec cat\n"), 0700); err != nil {
		t.Fatal(err)
	}
	input, writer, reader, output := ownPipes(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	writer.WriteString("{\"id\":1}\n")
	writer.Close()
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{helper, "unused"}, input, output) }()
	response, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if string(response) != "{\"id\":1}\n" {
		t.Fatal("queued local request lost")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func readTestFrame(input io.Reader) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(input, header[:]); err != nil {
		return nil, err
	}
	size := binary.BigEndian.Uint32(header[:])
	if size > NATIVE_FRAME_BYTES {
		return nil, errors.New("oversized transport frame")
	}
	body := make([]byte, size)
	_, err := io.ReadFull(input, body)
	return body, err
}

func TestUnreadOutputIsBoundedWithOpenInput(t *testing.T) {
	helper, _ := fixture(t, func(conn *net.UnixConn) {
		bufio.NewReader(conn).ReadString('\n')
		conn.Write([]byte{NATIVE_ACK})
		for i := 0; i < 16; i++ {
			if err := writeFrame(conn, bytes.Repeat([]byte("x"), NATIVE_FRAME_BYTES)); err != nil {
				return
			}
		}
	})
	input, _, _, output := ownPipes(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	err := run(ctx, []string{helper, "unused"}, input, output)
	if !errors.Is(err, os.ErrDeadlineExceeded) {
		t.Fatalf("unread output did not time out: %v", err)
	}
}

func TestIdleBridgeSendsHeartbeat(t *testing.T) {
	heartbeat := make(chan int, 1)
	helper, _ := fixture(t, func(conn *net.UnixConn) {
		r := bufio.NewReader(conn)
		r.ReadString('\n')
		conn.Write([]byte{NATIVE_ACK})
		frame, err := readTestFrame(r)
		if err == nil {
			heartbeat <- len(frame)
		}
		io.Copy(io.Discard, r)
	})
	input, _, _, output := ownPipes(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, []string{helper, "unused"}, input, output) }()
	select {
	case size := <-heartbeat:
		if size != 0 {
			t.Fatal("heartbeat carried MCP data")
		}
	case <-time.After(7 * time.Second):
		cancel()
		<-done
		t.Fatal("idle bridge failed to renew")
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestStartupInputErrorFails(t *testing.T) {
	helper := filepath.Join(t.TempDir(), "wait-helper")
	if err := os.WriteFile(helper, []byte("#!/bin/sh\nexec sleep 20\n"), 0700); err != nil {
		t.Fatal(err)
	}
	input, _, _, output := ownPipes(t)
	input.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := run(ctx, []string{helper, "unused"}, input, output); !errors.Is(err, os.ErrClosed) {
		t.Fatalf("stdin error lost: %v", err)
	}
}

func TestQueuedInputEOFStillReportsBootstrapRefusal(t *testing.T) {
	helper := filepath.Join(t.TempDir(), "refusing-helper")
	script := "#!/bin/sh\nprintf 'configured\\n' >&3\ndd bs=1 count=1 >/dev/null 2>/dev/null\nexit 1\n"
	if err := os.WriteFile(helper, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	input, writer, _, output := ownPipes(t)
	writer.WriteString("opaque request\n")
	writer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := run(ctx, []string{helper, "unused"}, input, output); err == nil {
		t.Fatal("queued EOF hid startup refusal")
	}
}

func TestClosedOutputReturnsTypedWriteFailure(t *testing.T) {
	reader, output, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()
	reader.Close()
	_, err = copyNativeOutput(output, bytes.NewReader([]byte("opaque reply")))
	if !errors.Is(err, errOutput) || !errors.Is(err, syscall.EPIPE) {
		t.Fatalf("stdout failure cause lost: %v", err)
	}
}
