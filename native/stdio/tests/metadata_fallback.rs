use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

struct Fixture {
    directory: PathBuf,
    child: Child,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_dir_all(&self.directory);
    }
}

#[test]
fn metadata_is_ready_before_resident_startup_and_calls_wait_for_fallback() {
    let directory = std::env::temp_dir()
        .canonicalize()
        .unwrap()
        .join(format!("huly-early-metadata-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    let helper = directory.join("node");
    fs::write(
        &helper,
        r#"#!/usr/bin/env python3
import json, os, pathlib, sys, time
root = pathlib.Path(__file__).parent
if os.environ['MCP_TRANSPORT'] == 'resident-bootstrap':
    (root / 'bootstrap.pid').write_text(str(os.getpid()))
    (root / 'metadata-first').write_text(str((root / 'initialized').exists()))
    time.sleep(20)
    sys.exit(1)
for line in sys.stdin:
    request = json.loads(line)
    method = request.get('method')
    if method == 'initialize':
        time.sleep(0.1)
        (root / 'initialized').touch()
        result = {'protocolVersion': '2025-06-18', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'fixture', 'version': '1'}}
    elif method == 'tools/list':
        result = {'tools': [{'name': 'fixture_read', 'inputSchema': {'type': 'object'}}]}
    elif method == 'tools/call':
        with (root / 'calls').open('a') as output:
            output.write(str(request['id']) + '\n')
        result = {'content': [{'type': 'text', 'text': 'read succeeded'}]}
    else:
        continue
    print(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': result}), flush=True)
"#,
    )
    .unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
    let started = Instant::now();
    let child = Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
        .args([helper.as_os_str(), "unused".as_ref(), "1000".as_ref()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut fixture = Fixture { directory, child };
    let stdout = fixture.child.stdout.take().unwrap();
    let (send, receive) = mpsc::channel();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            if send.send(line.unwrap()).is_err() {
                break;
            }
        }
    });
    // A client can send initialization after the native adapter has started.
    thread::sleep(Duration::from_millis(25));
    let mut input = fixture.child.stdin.take().unwrap();
    writeln!(input, r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"protocolVersion":"2025-06-18","capabilities":{{}},"clientInfo":{{"name":"codex","version":"fixture"}}}}}}"#).unwrap();
    let initialized = receive
        .recv_timeout(Duration::from_millis(500))
        .expect("initialize must not wait for resident startup");
    assert!(initialized.contains("protocolVersion"));
    writeln!(
        input,
        r#"{{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{{}}}}"#
    )
    .unwrap();
    let catalog = receive
        .recv_timeout(Duration::from_millis(500))
        .expect("tools/list must not wait for resident startup");
    assert!(catalog.contains("fixture_read"));
    writeln!(input, r#"{{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{{"name":"fixture_read","arguments":{{}}}}}}"#).unwrap();
    assert!(receive.recv_timeout(Duration::from_millis(200)).is_err());
    let reply = receive.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(reply.contains("read succeeded"));
    assert!(started.elapsed() >= Duration::from_millis(1000));
    assert_eq!(
        fs::read_to_string(fixture.directory.join("calls")).unwrap(),
        "3\n"
    );
    assert_eq!(
        fs::read_to_string(fixture.directory.join("metadata-first")).unwrap(),
        "True"
    );
    drop(input);
    assert!(fixture.child.wait().unwrap().success());
    reader.join().unwrap();
}

#[test]
fn resident_handoff_reestablishes_initialization_without_replaying_tools_or_retaining_metadata_process()
 {
    use std::os::unix::net::UnixListener;
    let directory = std::env::temp_dir()
        .canonicalize()
        .unwrap()
        .join(format!("huly-metadata-handoff-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    let socket_path = directory.join("s");
    let listener = UnixListener::bind(&socket_path).unwrap();
    fs::set_permissions(&socket_path, fs::Permissions::from_mode(0o600)).unwrap();
    let backend = thread::spawn(move || {
        let (socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut peer = BufReader::new(socket);
        let mut hello = String::new();
        peer.read_line(&mut hello).unwrap();
        assert_eq!(hello, "{}\n");
        peer.get_mut().write_all(&[1]).unwrap();
        let mut methods = Vec::new();
        loop {
            let mut header = [0; 4];
            if std::io::Read::read_exact(&mut peer, &mut header).is_err() {
                return methods;
            }
            let mut bytes = vec![0; usize::try_from(u32::from_be_bytes(header)).unwrap()];
            std::io::Read::read_exact(&mut peer, &mut bytes).unwrap();
            if bytes.is_empty() {
                continue;
            }
            for line in bytes
                .split(|byte| *byte == b'\n')
                .filter(|line| !line.is_empty())
            {
                let request: serde_json::Value = serde_json::from_slice(line).unwrap();
                let method = request["method"].as_str().unwrap();
                methods.push(method.to_owned());
                if method == "notifications/initialized" {
                    continue;
                }
                assert!(matches!(method, "initialize" | "tools/call"));
                let result = if method == "initialize" {
                    serde_json::json!({"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"resident","version":"1"}})
                } else {
                    serde_json::json!({"content":[{"type":"text","text":"resident read"}]})
                };
                let reply = format!(
                    "{}\n",
                    serde_json::json!({"jsonrpc":"2.0","id":request["id"],"result":result})
                );
                peer.get_mut()
                    .write_all(&u32::try_from(reply.len()).unwrap().to_be_bytes())
                    .unwrap();
                peer.get_mut().write_all(reply.as_bytes()).unwrap();
            }
        }
    });
    let helper = directory.join("node");
    fs::write(&helper, r#"#!/usr/bin/env python3
import json, os, pathlib, sys, time
root = pathlib.Path(__file__).parent
if os.environ['MCP_TRANSPORT'] == 'resident-bootstrap':
    os.write(3, b'configured\n')
    assert sys.stdin.buffer.read(1) == b'\1'
    time.sleep(0.7)
    os.write(3, (str(root / 's') + '\n{}\n').encode())
    os.close(3)
    assert sys.stdin.readline().strip() == 'attached'
    sys.exit(0)
(root / 'metadata.pid').write_text(str(os.getpid()))
for line in sys.stdin:
    request = json.loads(line)
    method = request.get('method')
    if method == 'initialize':
        result = {'protocolVersion': '2025-06-18', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'fixture', 'version': '1'}}
    elif method == 'tools/list':
        result = {'tools': [{'name': 'fixture_read', 'inputSchema': {'type': 'object'}}]}
    elif method == 'tools/call':
        (root / 'unexpected-local-call').write_text('A tool escaped before selection')
        result = {}
    else:
        continue
    print(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': result}), flush=True)
"#).unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
    let child = Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
        .args([helper.as_os_str(), "unused".as_ref(), "3000".as_ref()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut fixture = Fixture { directory, child };
    let stdout = fixture.child.stdout.take().unwrap();
    let (send, receive) = mpsc::channel();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            if send.send(line.unwrap()).is_err() {
                break;
            }
        }
    });
    let mut input = fixture.child.stdin.take().unwrap();
    writeln!(input, r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"protocolVersion":"2025-06-18","capabilities":{{}},"clientInfo":{{"name":"codex","version":"fixture"}}}}}}"#).unwrap();
    assert!(
        receive
            .recv_timeout(Duration::from_millis(500))
            .unwrap()
            .contains("protocolVersion")
    );
    writeln!(
        input,
        r#"{{"jsonrpc":"2.0","method":"notifications/initialized"}}"#
    )
    .unwrap();
    writeln!(
        input,
        r#"{{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{{}}}}"#
    )
    .unwrap();
    assert!(
        receive
            .recv_timeout(Duration::from_millis(500))
            .unwrap()
            .contains("fixture_read")
    );
    writeln!(input, r#"{{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{{"name":"fixture_read","arguments":{{}}}}}}"#).unwrap();
    assert!(
        receive
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .contains("resident read")
    );
    assert!(!fixture.directory.join("unexpected-local-call").exists());
    let metadata_pid: i32 = fs::read_to_string(fixture.directory.join("metadata.pid"))
        .unwrap()
        .parse()
        .unwrap();
    // SAFETY: signal zero only tests whether the fixture's observed process still exists.
    assert_eq!(
        unsafe { libc::kill(metadata_pid, 0) },
        -1,
        "temporary metadata process was retained"
    );
    drop(input);
    assert!(fixture.child.wait().unwrap().success());
    reader.join().unwrap();
    assert_eq!(
        backend.join().unwrap(),
        ["initialize", "notifications/initialized", "tools/call"]
    );
}

#[test]
fn temporary_metadata_spawn_failure_preserves_every_consumed_message_for_fallback() {
    let directory = std::env::temp_dir().canonicalize().unwrap().join(format!(
        "huly-metadata-spawn-failure-{}",
        std::process::id()
    ));
    fs::create_dir(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    let helper = directory.join("node");
    fs::write(
        &helper,
        r#"#!/usr/bin/env python3
import os, pathlib, signal, sys, time
root = pathlib.Path(__file__).parent
if os.environ['MCP_TRANSPORT'] == 'resident-bootstrap':
    def restore(signum, frame):
        os.chmod(__file__, 0o700)
        sys.exit(0)
    signal.signal(signal.SIGTERM, restore)
    os.chmod(__file__, 0o600)
    (root / 'ready').write_text('temporary metadata spawn must fail')
    time.sleep(20)
    restore(None, None)
else:
    while True:
        chunk = os.read(0, 65536)
        if not chunk:
            break
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
"#,
    )
    .unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
    let child = Command::new(env!("CARGO_BIN_EXE_huly-stdio"))
        .args([helper.as_os_str(), "unused".as_ref(), "3000".as_ref()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut fixture = Fixture { directory, child };
    let ready_bound = Instant::now() + Duration::from_secs(1);
    while !fixture.directory.join("ready").exists() {
        assert!(Instant::now() < ready_bound);
        thread::sleep(Duration::from_millis(5));
    }
    let first = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"first\"}}\n";
    let metadata = b"{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"initialize\",\"params\":{}}\n";
    let last = b"{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"last\"}}\n";
    let mut input = fixture.child.stdin.take().unwrap();
    input
        .write_all(&[first.as_slice(), metadata.as_slice(), last.as_slice()].concat())
        .unwrap();
    drop(input);
    let mut output = Vec::new();
    std::io::Read::read_to_end(&mut fixture.child.stdout.take().unwrap(), &mut output).unwrap();
    assert!(fixture.child.wait().unwrap().success());
    // Metadata precedes deferred application dispatch; all three raw frames survive.
    assert_eq!(
        output,
        [metadata.as_slice(), first.as_slice(), last.as_slice()].concat()
    );
}
