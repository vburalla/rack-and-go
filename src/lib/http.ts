import { Capacitor, CapacitorHttp, HttpOptions, HttpResponse } from "@capacitor/core";

export type HttpPostResult<T = any> = { status: number; data: T };

const isWeb = Capacitor.getPlatform() === "web";

const ACCEPT_HEADER = "application/json, text/plain, */*";
const NATIVE_ORIGIN = "https://ajuntament-destivella.appointlet.com";

export async function httpGetJson<T = any>(url: string): Promise<T> {
  const headers = {
    "accept": "*/*",
    "accept-language": "es,es-ES;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Not;A=Brand\";v=\"99\", \"Microsoft Edge\";v=\"139\", \"Chromium\";v=\"139\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0"
  };

  if (isWeb) {
    const res = await fetch(url, {
      method: "GET",
      headers,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  const resp = await CapacitorHttp.request({
    url,
    method: "GET",
    headers: headers,
    responseType: "json",
    withCredentials: true,
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
