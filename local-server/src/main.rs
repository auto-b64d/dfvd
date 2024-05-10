use std::{env::current_exe, fs, path::{Path, PathBuf}, process::Command};

use actix_web::{post, web::{Json, PayloadConfig}, App, HttpResponse, HttpServer, Responder};
use base64::{engine::general_purpose::STANDARD, Engine};
use lazy_static::lazy_static;
use regex::{Captures, Regex};
use serde::Deserialize;

const TOOL_NAME: &str = "N_m3u8DL-RE";

type PostId = u32;

fn create_dl_command(post_id: PostId) -> Command {
	let mut cmd = Command::new(TOOL_NAME);
	let cwd = get_cwd();
	cmd.current_dir(&cwd);
	cmd.args(vec![
		&path_to_quoted_string(&get_m3u8_path(post_id)),
		"--save-dir", &path_to_quoted_string(&cwd.join("result")),
		"--save-name", &format!("{post_id}"),
	]);
	cmd
}

fn get_m3u8_path(post_id: PostId) -> PathBuf {
	get_cwd().join(format!("temp/{post_id}.m3u8"))
}

const _50MB_IN_BYTES: usize = 50 * 1000 * 1000;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
	let server = HttpServer::new(|| {
		App::new()
			.app_data(PayloadConfig::new(_50MB_IN_BYTES))
			.service(download)
	})
		.bind(("127.0.0.1", 9987))?
		.run();
	println!("server on");
	server.await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadReqBody {
	post_id: PostId,
	main_body: String,
	keys: Vec<Vec<u8>>,
}
#[post("/download")]
async fn download(json: Json<DownloadReqBody>) -> impl Responder {
	let body = json.into_inner();
	println!("video received");
	
	let m3u8_path = get_m3u8_path(body.post_id);
	write_include_parents(&m3u8_path, replace_urls(&body, &body.main_body)).unwrap();
	let mut dl_cmd = create_dl_command(body.post_id);
	let o = dl_cmd.output()
		.expect(&format!("failed to execute {TOOL_NAME}"));
	fs::remove_file(&m3u8_path).unwrap();
	
	if o.status.success() {
		HttpResponse::Ok().finish()
	} else {
		HttpResponse::InternalServerError().body(o.stderr)
	}
}

fn replace_urls(download_body: &DownloadReqBody, main_body: &String) -> String {
	lazy_static! {
		static ref KEY_URI_REGEX: Regex = Regex::new(r#"(?P<before>#EXT-X-KEY:[^"]+")([^"]+)"#).unwrap();
	}
	
	let mut idx = 0;
	let res = KEY_URI_REGEX.replace_all(main_body, |caps: &Captures| {
		let key = &download_body.keys[idx as usize];
		let base64_encoded = STANDARD.encode(key);
		let base64_data_uri = format!("base64:{base64_encoded}");
		idx += 1;
		caps["before"].to_string() + &base64_data_uri
	})
		.into_owned();
	res
}

fn path_to_quoted_string(path: &PathBuf) -> String {
	format!("\"{}\"", path.to_str().unwrap().to_string())
}
fn write_include_parents<P: AsRef<Path>, C: AsRef<[u8]>>(path: P, contents: C) -> std::io::Result<()> {
	let parent = path.as_ref().parent().unwrap();
	fs::create_dir_all(&parent)?;
	fs::write(&path, contents)?;
	Ok(())
}

fn get_cwd() -> PathBuf {
	current_exe().expect("failed to get exe path")
		.parent().unwrap()
		.to_path_buf()
}
