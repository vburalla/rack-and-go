import { Capacitor, CapacitorHttp, HttpOptions, HttpResponse } from "@capacitor/core";

export type HttpPostResult<T = any> = { status: number; data: T };

const isWeb = Capacitor.getPlatform() === "web";

const ACCEPT_HEADER = "application/json, text/plain, */*";
const NATIVE_ORIGIN = "https://ajuntament-destivella.appointlet.com";

export async function httpGetJson<T = any>(url: string): Promise<T> {
  const headers = {
    Accept: ACCEPT_HEADER,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
  };

  if (isWeb) {
    const res = await fetch(url, {
      method: "GET",
      headers,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  const resp = await CapacitorHttp.request({
    url,
    method: "GET",
    headers: { ...headers, Origin: NATIVE_ORIGIN },
    responseType: "json",
  } as HttpOptions);
  if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}`);
  return (resp as HttpResponse).data as T;
}

export async function httpPostJson<T = any>(url: string, body: any): Promise<HttpPostResult<T>> {
  const headers = {
    "Content-Type": "application/json",
    Accept: ACCEPT_HEADER,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
  };

  if (isWeb) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    return { status: res.status, data } as HttpPostResult<T>;
  }
  const resp = await CapacitorHttp.request({
    url,
    method: "POST",
    headers: { ...headers, Origin: NATIVE_ORIGIN },
    data: body,
    responseType: "json",
  } as HttpOptions);
  return { status: resp.status, data: (resp as HttpResponse).data as T } as HttpPostResult<T>;
}
