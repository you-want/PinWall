//! Public-address-only JSON proxy. DNS answers are validated and pinned to the connection.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;
use tokio::sync::oneshot;
const LIMIT: usize = 1024 * 1024;
#[derive(Default)]
pub struct NetworkService {
    requests: Mutex<HashMap<String, (String, oneshot::Sender<()>)>>,
}
struct Pending<'a> {
    service: &'a NetworkService,
    id: String,
}
impl Drop for Pending<'_> {
    fn drop(&mut self) {
        if let Ok(mut requests) = self.service.requests.lock() {
            requests.remove(&self.id);
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    request_id: String,
    widget_id: String,
    url: String,
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}
#[derive(Serialize)]
pub struct Response {
    status: u16,
    data: Value,
}
fn public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !matches!(a, 0 | 10 | 127 | 224..=255)
        && !(a == 100 && (64..=127).contains(&b))
        && !(a == 169 && b == 254)
        && !(a == 172 && (16..=31).contains(&b))
        && !(a == 192 && (b == 0 || b == 168 || b == 88 && c == 99 || b == 2))
        && !(a == 198 && ((18..=19).contains(&b) || b == 51 && c == 100))
        && !(a == 203 && b == 0 && c == 113)
}
fn public_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    // Conservatively admit global unicast only; no mapped IPv4, NAT64, 6to4 or local/multicast ranges.
    (s[0] & 0xe000) == 0x2000
        && s[0] != 0x2002
        && !(s[0] == 0x2001 && (s[1] <= 0x01ff || s[1] == 0x0db8))
}
fn public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => public_v4(ip),
        IpAddr::V6(ip) => public_v6(ip),
    }
}
fn url(input: &str) -> Result<reqwest::Url, String> {
    if input.len() > 8192 {
        return Err("widget_network_invalid".into());
    }
    let parsed = reqwest::Url::parse(input).map_err(|_| "widget_network_invalid")?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.port_or_known_default(), Some(80 | 443))
    {
        return Err("widget_network_denied".into());
    }
    let host = parsed
        .host_str()
        .ok_or("widget_network_invalid")?
        .trim_end_matches('.')
        .to_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || !host.contains('.') && !host.contains(':')
    {
        return Err("widget_network_denied".into());
    }
    if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
        if !public(ip) {
            return Err("widget_network_denied".into());
        }
    }
    Ok(parsed)
}
fn headers(input: &HashMap<String, String>) -> Result<reqwest::header::HeaderMap, String> {
    if input.len() > 16 {
        return Err("widget_network_invalid".into());
    }
    let mut result = reqwest::header::HeaderMap::new();
    let mut size = 0;
    for (name, value) in input {
        let lower = name.to_ascii_lowercase();
        if !matches!(
            lower.as_str(),
            "accept" | "content-type" | "accept-language" | "x-widget"
        ) {
            continue;
        }
        size += name.len() + value.len();
        if size > 4096 {
            return Err("widget_network_invalid".into());
        }
        let name = reqwest::header::HeaderName::from_bytes(lower.as_bytes())
            .map_err(|_| "widget_network_invalid")?;
        let value =
            reqwest::header::HeaderValue::from_str(value).map_err(|_| "widget_network_invalid")?;
        result.insert(name, value);
    }
    Ok(result)
}
async fn resolve(parsed: &reqwest::Url) -> Result<Vec<SocketAddr>, String> {
    let host = parsed
        .host_str()
        .ok_or("widget_network_invalid")?
        .trim_matches(['[', ']']);
    let port = parsed
        .port_or_known_default()
        .ok_or("widget_network_invalid")?;
    let addresses = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::lookup_host((host, port)),
    )
    .await
    .map_err(|_| "widget_network_timeout")?
    .map_err(|_| "widget_network_unavailable")?
    .collect::<Vec<_>>();
    if addresses.is_empty() || addresses.len() > 16 || addresses.iter().any(|a| !public(a.ip())) {
        return Err("widget_network_denied".into());
    }
    Ok(addresses)
}
async fn send(
    parsed: reqwest::Url,
    method: &str,
    input: &HashMap<String, String>,
    body: Option<String>,
    addresses: &[SocketAddr],
) -> Result<Response, String> {
    let host = parsed.host_str().ok_or("widget_network_invalid")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(4))
        .pool_max_idle_per_host(0)
        .resolve_to_addrs(host, addresses)
        .build()
        .map_err(|_| "widget_network_unavailable")?;
    let method = match method {
        "get" => reqwest::Method::GET,
        "post" => reqwest::Method::POST,
        _ => return Err("widget_network_invalid".into()),
    };
    let mut request = client
        .request(method, parsed)
        .headers(headers(input)?)
        .header("accept-encoding", "identity");
    if let Some(body) = body {
        if body.len() > LIMIT {
            return Err("widget_network_limit".into());
        }
        request = request.body(body);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "widget_network_unavailable")?;
    if response.status().is_redirection() {
        return Err("widget_network_redirect".into());
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if content_type != "application/json"
        && !(content_type.starts_with("application/") && content_type.ends_with("+json"))
    {
        return Err("widget_network_not_json".into());
    }
    if response.content_length().is_some_and(|v| v > LIMIT as u64) {
        return Err("widget_network_limit".into());
    }
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "widget_network_unavailable")?
    {
        if chunk.len() > LIMIT.saturating_sub(bytes.len()) {
            return Err("widget_network_limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let data: Value = serde_json::from_slice(&bytes).map_err(|_| "widget_network_not_json")?;
    Ok(Response { status, data })
}
#[tauri::command]
pub async fn widget_network_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request: Request,
) -> Result<Response, String> {
    crate::metrics::require_main(window.label())?;
    crate::widgets::require_widget_permission(&app, &request.widget_id, "network")?;
    if request.request_id.is_empty()
        || request.request_id.len() > 128
        || !request
            .request_id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("widget_network_invalid".into());
    }
    if !matches!(request.method.as_str(), "get" | "post")
        || request.method == "get" && request.body.is_some()
        || request.body.as_ref().is_some_and(|b| b.len() > LIMIT)
    {
        return Err("widget_network_invalid".into());
    }
    let parsed = url(&request.url)?;
    headers(&request.headers)?;
    let service = app.state::<NetworkService>();
    let (tx, rx) = oneshot::channel();
    {
        let mut pending = service
            .requests
            .lock()
            .map_err(|_| "widget_network_unavailable")?;
        if pending.len() >= 8
            || pending.contains_key(&request.request_id)
            || pending
                .values()
                .filter(|(id, _)| id == &request.widget_id)
                .count()
                >= 2
        {
            return Err("widget_network_busy".into());
        }
        pending.insert(request.request_id.clone(), (request.widget_id.clone(), tx));
    }
    let _pending = Pending {
        service: &service,
        id: request.request_id.clone(),
    };
    let task = async {
        let addresses = resolve(&parsed).await?;
        send(
            parsed,
            &request.method,
            &request.headers,
            request.body,
            &addresses,
        )
        .await
    };
    tokio::select! { _=rx=>Err("widget_network_cancelled".into()), result=tokio::time::timeout(Duration::from_secs(15),task)=>result.map_err(|_|"widget_network_timeout".to_string())? }
}
#[tauri::command]
pub fn cancel_widget_network(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    request_id: String,
) -> Result<(), String> {
    crate::metrics::require_main(window.label())?;
    if let Some((_, tx)) = app
        .state::<NetworkService>()
        .requests
        .lock()
        .map_err(|_| "widget_network_unavailable")?
        .remove(&request_id)
    {
        let _ = tx.send(());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn denies_private_reserved_tunnels_and_credential_urls() {
        for host in [
            "127.1",
            "0x7f000001",
            "2130706433",
            "10.0.0.1",
            "100.64.0.1",
            "169.254.1.1",
            "172.31.2.1",
            "192.0.0.1",
            "192.168.1.2",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.2",
            "224.0.0.1",
            "[::1]",
            "[::ffff:127.0.0.1]",
            "[64:ff9b::a00:1]",
            "[2002:7f00:1::]",
            "localhost.",
            "app.local",
            "host.internal",
        ] {
            assert!(url(&format!("https://{host}/")).is_err(), "{host}");
        }
        for input in [
            "file:///etc/passwd",
            "https://user:pass@example.com/",
            "https://example.com:5432/",
            "http://printer/",
        ] {
            assert!(url(input).is_err());
        }
        assert!(url("https://api.open-meteo.com/v1/forecast").is_ok());
        assert!(public("8.8.8.8".parse().unwrap()));
        assert!(public("2606:4700:4700::1111".parse().unwrap()));
    }
    #[test]
    fn strips_ambient_credentials_and_rejects_header_injection() {
        let map = HashMap::from([
            ("Authorization".into(), "secret".into()),
            ("Cookie".into(), "secret".into()),
            ("X-Widget".into(), "test".into()),
        ]);
        let result = headers(&map).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result["x-widget"], "test");
        assert!(headers(&HashMap::from([(
            "Accept".into(),
            "x\r\nInjected: yes".into()
        )]))
        .is_err());
    }
    #[test]
    fn pinned_transport_rejects_redirects_and_oversized_json_without_following() {
        use std::io::{Read, Write};
        for (reply,expected) in [
            ("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/secret\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".to_string(),"widget_network_redirect"),
            (format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",LIMIT+1),"widget_network_limit"),
        ] {
            let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address=listener.local_addr().unwrap();
            let server=std::thread::spawn(move||{let (mut socket,_)=listener.accept().unwrap();let mut request=[0u8;2048];let read=socket.read(&mut request).unwrap();assert!(String::from_utf8_lossy(&request[..read]).contains("pinwall-proxy-test.example"));socket.write_all(reply.as_bytes()).unwrap();});
            let runtime=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
            let parsed=reqwest::Url::parse(&format!("http://pinwall-proxy-test.example:{}/",address.port())).unwrap();
            let result=runtime.block_on(send(parsed,"get",&HashMap::new(),None,&[address]));
            assert!(matches!(result,Err(code) if code==expected));server.join().unwrap();
        }
    }
}
