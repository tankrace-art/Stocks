"""KRX 금시장 API 디버그 스크립트

로컬에서 실행하여 올바른 bld 경로와 파라미터를 찾는다.

사용법:
    python -m krx_gold.debug
"""

import requests

BASE = "http://data.krx.co.kr"
BASE_S = "https://data.krx.co.kr"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Referer": f"{BASE_S}/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201060201",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "X-Requested-With": "XMLHttpRequest",
}

TRD_DD = "20260401"

# 테스트할 bld 후보들
BLD_CANDIDATES = [
    "dbms/MDC/STAT/standard/MDCSTAT14901",  # pykrx 기준
    "dbms/MDC/STAT/standard/MDCSTAT15001",
    "dbms/MDC/STAT/standard/MDCSTAT13901",
    "dbms/MDC/STAT/standard/MDCSTAT06601",
    "dbms/MDC/STAT/standard/MDCSTAT06701",
    "dbms/MDC/STAT/standard/MDCSTAT06801",
    "dbms/MDC/STAT/standard/MDCSTAT06901",
    "dbms/MDC/STAT/standard/MDCSTAT07001",
    "dbms/MDC/STAT/standard/MDCSTAT14801",
    "dbms/MDC/STAT/standard/MDCSTAT14901",
    "dbms/MDC/STAT/standard/MDCSTAT15101",
]


def test_json_api():
    print("=" * 70)
    print("  KRX 금시장 API 디버그")
    print("=" * 70)

    # 1) HTTP vs HTTPS 테스트
    print("\n[1] HTTP vs HTTPS 연결 테스트")
    for scheme, base in [("HTTP", BASE), ("HTTPS", BASE_S)]:
        url = f"{base}/comm/bldAttendant/getJsonData.cmd"
        try:
            resp = requests.post(url, data={
                "bld": "dbms/MDC/STAT/standard/MDCSTAT14901",
                "locale": "ko_KR",
                "trdDd": TRD_DD,
                "csvxls_isNo": "false",
            }, headers=HEADERS, timeout=10)
            print(f"  {scheme}: status={resp.status_code}, len={len(resp.text)}")
            if resp.status_code == 200 and resp.text.strip():
                print(f"    응답 미리보기: {resp.text[:200]}")
        except Exception as e:
            print(f"  {scheme}: 에러 - {e}")

    # 2) bld 경로별 테스트
    print(f"\n[2] bld 경로별 테스트 (조회일: {TRD_DD})")
    for base_url in [
        f"{BASE_S}/comm/bldAttendant/getJsonData.cmd",
        f"{BASE}/comm/bldAttendant/getJsonData.cmd",
    ]:
        scheme = "HTTPS" if "https" in base_url else "HTTP"
        print(f"\n  --- {scheme} ---")
        for bld in BLD_CANDIDATES:
            try:
                resp = requests.post(base_url, data={
                    "bld": bld,
                    "locale": "ko_KR",
                    "trdDd": TRD_DD,
                    "csvxls_isNo": "false",
                }, headers=HEADERS, timeout=10)

                status = resp.status_code
                text = resp.text.strip()

                if status == 200 and text and text != "{}":
                    try:
                        j = resp.json()
                        keys = list(j.keys())
                        for k in ["output", "OutBlock_1", "block1"]:
                            rows = j.get(k, [])
                            if rows:
                                print(f"  OK  {bld}")
                                print(f"       keys={keys}, rows={len(rows)}")
                                print(f"       첫 행: {rows[0]}")
                                break
                        else:
                            print(f"  --  {bld}: 200 but keys={keys}, no data rows")
                    except Exception:
                        print(f"  --  {bld}: 200 but not JSON: {text[:100]}")
                else:
                    print(f"  NG  {bld}: status={status}, body={text[:80]}")
            except Exception as e:
                print(f"  ER  {bld}: {e}")

        # 한 scheme에서 성공하면 다음은 스킵
        break

    # 3) OTP + CSV 다운로드 테스트
    print(f"\n[3] CSV 다운로드 테스트 (OTP 방식)")
    for bld in ["dbms/MDC/STAT/standard/MDCSTAT14901", "dbms/MDC/STAT/standard/MDCSTAT15001"]:
        for base in [BASE_S, BASE]:
            scheme = "HTTPS" if "https" in base else "HTTP"
            try:
                otp_url = f"{base}/comm/fileDn/GenerateOTP/generate.cmd"
                otp_resp = requests.post(otp_url, data={
                    "name": "fileDown",
                    "filetype": "csv",
                    "url": bld,
                    "csvxls_isNo": "false",
                    "locale": "ko_KR",
                    "trdDd": TRD_DD,
                }, headers=HEADERS, timeout=10)
                otp = otp_resp.text.strip()
                print(f"  {scheme} OTP for {bld[-13:]}: status={otp_resp.status_code}, otp_len={len(otp)}")

                if otp and len(otp) > 10:
                    down_url = f"{base}/comm/fileDn/download_csv/download.cmd"
                    down_resp = requests.post(down_url, data={"code": otp}, headers=HEADERS, timeout=10)
                    print(f"    다운로드: status={down_resp.status_code}, size={len(down_resp.content)} bytes")
                    print(f"    미리보기: {down_resp.content[:200]}")
            except Exception as e:
                print(f"  {scheme} {bld[-13:]}: {e}")

    print("\n" + "=" * 70)
    print("  위 결과를 개발자에게 보내주세요!")
    print("=" * 70)


if __name__ == "__main__":
    test_json_api()
    input("\nEnter 키를 누르면 종료됩니다...")
