import { NextResponse, type NextRequest } from "next/server";

// Next.js 16부터 Middleware는 Proxy로 이름이 바뀌었다(동작은 동일).
// 휴대폰 브라우저에서 흔히 쓰는 User-Agent 토큰만 본다. iPad는 iPadOS 13+에서
// 기본적으로 데스크톱 UA를 보내 이 방식으로 안정적으로 잡을 수 없고, 화면이
// 넓은 태블릿까지 강제로 /m으로 보내는 것은 이번 요청 범위를 넘는다.
const MOBILE_USER_AGENT_PATTERN =
  /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";

  if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) {
    const url = request.nextUrl.clone();
    url.pathname = "/m";

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// 정확히 루트 경로에서만 실행되도록 제한한다 — /m, /m/timeline 등 다른 모든
// 경로는 이 Proxy 자체가 실행되지 않으므로 추가 리다이렉트나 무한 루프
// 가능성이 구조적으로 없다.
export const config = {
  matcher: "/",
};
