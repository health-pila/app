// 배포할 때 index.html의 ?v= 숫자와 함께 변경합니다.
const APP_VERSION = "47";
const APP_SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `workout-check:${APP_SCOPE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION}`;
const APP_SHELL_URL = new URL("index.html", APP_SCOPE).href;

const APP_FILES = [
  "./",
  "./index.html",
  `./style.css?v=${APP_VERSION}`,
  `./exercise-data.js?v=${APP_VERSION}`,
  `./routine-components.js?v=${APP_VERSION}`,
  `./script.js?v=${APP_VERSION}`,
  "./manifest.json",
  "./images/center-logo.png",
  "./images/icon-192.png",
  "./images/icon-512.png"
];

function belongsToThisApp(urlValue) {
  const url = new URL(urlValue, APP_SCOPE);
  return url.origin === APP_SCOPE.origin && url.pathname.startsWith(APP_SCOPE.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

async function removeOutdatedAppCaches() {
  const names = await caches.keys();
  await Promise.all(names.map(async (name) => {
    if (name === CACHE_NAME) return;

    if (name.startsWith(CACHE_PREFIX)) {
      await caches.delete(name);
      return;
    }

    // v43까지의 캐시도 내용이 모두 이 앱의 주소일 때만 정리합니다.
    if (/^workout-check-v\d+$/.test(name)) {
      const oldCache = await caches.open(name);
      const requests = await oldCache.keys();
      if (requests.length > 0 && requests.every((request) => belongsToThisApp(request.url))) {
        await caches.delete(name);
      }
    }
  }));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    removeOutdatedAppCaches().then(() => self.clients.claim())
  );
});

async function findCurrentCachedResponse(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return await cache.match(APP_SHELL_URL);
  } catch (error) {
    console.warn("앱 캐시 조회 실패:", error);
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 외부 서비스, 다른 프로젝트, GET 이외의 요청은 처리하지 않습니다.
  if (request.method !== "GET" || !belongsToThisApp(request.url)) return;

  let cacheWrite = Promise.resolve();
  const responsePromise = (async () => {
    let networkResponse = null;
    try {
      networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const responseCopy = networkResponse.clone();
        cacheWrite = caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, responseCopy))
          .catch((error) => {
            // 캐시 저장에 실패해도 정상 네트워크 응답은 그대로 사용합니다.
            console.warn("앱 캐시 저장 실패:", error);
          });
        return networkResponse;
      }
    } catch (error) {
      // 연결 실패 시 현재 버전의 캐시를 확인합니다.
    }

    const cached = await findCurrentCachedResponse(request);
    if (cached) return cached;
    if (networkResponse) return networkResponse;

    return new Response("네트워크 연결을 확인하고 다시 시도해 주세요.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })();

  event.respondWith(responsePromise);
  event.waitUntil(responsePromise.then(() => cacheWrite));
});
