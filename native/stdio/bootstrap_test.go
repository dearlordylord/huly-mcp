//go:build linux || darwin

package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBootstrapRejectsMalformedFrames(t *testing.T) {
	cases := []string{"", "relative\n{}\n", "/tmp/../socket\n{}\n", "/tmp/x\r\n{}\n", "/tmp/x\x00\n{}\n", "/tmp/x\n{}\nextra\n", "/tmp/x\n", "/" + strings.Repeat("a", 103) + "\n{}\n", strings.Repeat("x", NATIVE_CONTROL_BYTES+1)}
	for _, frame := range cases {
		if _, err := parseBootstrap([]byte(frame)); err == nil {
			t.Fatal("unsafe frame accepted")
		}
	}
}

func TestBootstrapKeepsProofOpaque(t *testing.T) {
	b, err := parseBootstrap([]byte("/tmp/private/s\n{\"opaque\":true}\n"))
	if err != nil || b.path != "/tmp/private/s" || string(b.hello) != "{\"opaque\":true}\n" {
		t.Fatal("bootstrap frame changed")
	}
}

func TestBootstrapDoesNotRetainInheritedTransport(t *testing.T) {
	got := bootstrapEnvironment([]string{"MCP_TRANSPORT=stdio-resident", "HULY_PROFILE=work"})
	if strings.Join(got, ";") != "HULY_PROFILE=work;MCP_TRANSPORT=resident-bootstrap" {
		t.Fatal("bootstrap environment changed")
	}
}

func TestPrivateSocketRejectsFilesAndPermissiveDirectories(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "s")
	if err := os.WriteFile(path, []byte("not a socket"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := privateSocket(path); err == nil {
		t.Fatal("regular file accepted")
	}
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := privateSocket(path); err == nil {
		t.Fatal("public directory accepted")
	}
	if err := privateSocket(filepath.Join(dir, "missing")); err == nil {
		t.Fatal("missing socket accepted")
	}
}

func TestHelperFailureIsTerminal(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := prepare(ctx, "/does-not-exist", "unused", func() bool { return true }); err == nil {
		t.Fatal("missing helper accepted")
	}
}
