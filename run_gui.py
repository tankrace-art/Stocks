"""DART 재무분석 투자도구 - 원클릭 실행

더블클릭 한 번으로 실행됩니다.
필요한 패키지가 없으면 자동으로 설치합니다.
"""

import json
import os
import subprocess
import sys
import threading
import traceback
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(SCRIPT_DIR, "dart_settings.json")

# ━━━ 1단계: 패키지 자동 설치 (stdlib만 사용) ━━━━━━━━━━━━━━━━━━━

REQUIRED = {
    "requests": "requests",
    "pandas": "pandas",
    "bs4": "beautifulsoup4",
    "lxml": "lxml",
    "openpyxl": "openpyxl",
}


def _check_and_install():
    missing = []
    for import_name, pip_name in REQUIRED.items():
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pip_name)

    if not missing:
        return

    print(f"  필요한 패키지를 설치합니다: {', '.join(missing)}")
    print("  인터넷 연결이 필요합니다. 잠시만 기다려주세요...\n")

    subprocess.check_call(
        [sys.executable, "-m", "pip", "install"] + missing,
        timeout=300,
    )
    print("\n  패키지 설치 완료!\n")


try:
    _check_and_install()
except Exception as e:
    print(f"\n  [오류] 패키지 설치에 실패했습니다: {e}")
    print(f"\n  수동 설치 방법:")
    print(f"    1. 명령 프롬프트(cmd)를 열고")
    print(f"    2. 아래 명령어를 입력하세요:")
    print(f"       pip install requests pandas beautifulsoup4 lxml openpyxl")
    input("\n  Enter를 누르면 종료합니다...")
    sys.exit(1)

# tkinter 확인 (Windows 기본 포함이지만 혹시 없을 경우)
try:
    import tkinter as tk
    from tkinter import ttk, messagebox, scrolledtext, filedialog
except ImportError:
    print("\n  [오류] tkinter를 찾을 수 없습니다.")
    print("  Python을 다시 설치해주세요.")
    print("  (설치할 때 'tcl/tk and IDLE' 옵션을 체크하세요)")
    input("\n  Enter를 누르면 종료합니다...")
    sys.exit(1)

# ━━━ 2단계: 본체 임포트 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

sys.path.insert(0, SCRIPT_DIR)

from dart_scraper.dart_client import DartClient
from dart_scraper.report_parser import ReportParser
from dart_scraper.analyzer import calculate_investment_metrics, build_clean_statement
from dart_scraper.utils import parse_period, save_investment_excel


# ━━━ 설정 파일 관리 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _find_desktop():
    candidates = [
        os.path.join(os.path.expanduser("~"), "Desktop"),
        os.path.join(os.path.expanduser("~"), "OneDrive", "Desktop"),
        os.path.join(os.path.expanduser("~"), "OneDrive", "바탕 화면"),
        os.path.join(os.path.expanduser("~"), "바탕 화면"),
    ]
    for path in candidates:
        if os.path.isdir(path):
            return path
    return os.path.expanduser("~")


def load_settings():
    defaults = {"api_key": "", "save_dir": _find_desktop()}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)
        defaults.update(saved)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return defaults


def save_settings(settings):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except OSError:
        pass


# ━━━ GUI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class DartAnalyzerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("DART 재무분석 투자도구")
        self.root.geometry("820x750")
        self.root.resizable(True, True)
        self.settings = load_settings()
        self._build_ui()
        self.running = False

    def _build_ui(self):
        # ── 타이틀 ──
        title_frame = ttk.Frame(self.root)
        title_frame.pack(fill="x", padx=15, pady=(10, 0))
        ttk.Label(
            title_frame,
            text="DART 재무분석 투자도구",
            font=("맑은 고딕", 16, "bold"),
        ).pack(side="left")
        ttk.Label(
            title_frame,
            text="재무제표 + 투자지표 + 사업내용 → 엑셀",
            foreground="gray",
            font=("맑은 고딕", 9),
        ).pack(side="right", pady=5)

        # ── 입력 영역 ──
        input_frame = ttk.LabelFrame(self.root, text=" 검색 조건 ", padding=15)
        input_frame.pack(fill="x", padx=15, pady=(10, 5))

        ttk.Label(input_frame, text="기업명:", font=("맑은 고딕", 11)).grid(
            row=0, column=0, sticky="w", pady=5
        )
        self.company_var = tk.StringVar()
        company_entry = ttk.Entry(
            input_frame, textvariable=self.company_var, width=30,
            font=("맑은 고딕", 11),
        )
        company_entry.grid(row=0, column=1, sticky="ew", padx=(10, 5), pady=5)
        company_entry.focus()
        ttk.Label(
            input_frame, text="예: 삼성전자, SK하이닉스", foreground="gray"
        ).grid(row=0, column=2, sticky="w", padx=5)

        ttk.Label(input_frame, text="기간:", font=("맑은 고딕", 11)).grid(
            row=1, column=0, sticky="w", pady=5
        )
        self.period_var = tk.StringVar(value="2020-2024")
        ttk.Entry(
            input_frame, textvariable=self.period_var, width=30,
            font=("맑은 고딕", 11),
        ).grid(row=1, column=1, sticky="ew", padx=(10, 5), pady=5)
        ttk.Label(
            input_frame, text="예: 2024, 2020-2024", foreground="gray"
        ).grid(row=1, column=2, sticky="w", padx=5)

        ttk.Label(input_frame, text="API 키:", font=("맑은 고딕", 11)).grid(
            row=2, column=0, sticky="w", pady=5
        )
        self.apikey_var = tk.StringVar(value=self.settings.get("api_key", ""))
        ttk.Entry(
            input_frame, textvariable=self.apikey_var, width=30,
            font=("맑은 고딕", 11), show="*",
        ).grid(row=2, column=1, sticky="ew", padx=(10, 5), pady=5)
        ttk.Label(
            input_frame, text="opendart.fss.or.kr 에서 발급", foreground="gray"
        ).grid(row=2, column=2, sticky="w", padx=5)

        input_frame.columnconfigure(1, weight=1)

        # ── 옵션 영역 ──
        option_frame = ttk.LabelFrame(self.root, text=" 분석 옵션 ", padding=10)
        option_frame.pack(fill="x", padx=15, pady=5)

        ttk.Label(option_frame, text="재무제표:").grid(row=0, column=0, sticky="w")
        self.fs_var = tk.StringVar(value="연결")
        ttk.Radiobutton(
            option_frame, text="연결재무제표", variable=self.fs_var, value="연결"
        ).grid(row=0, column=1, padx=10)
        ttk.Radiobutton(
            option_frame, text="개별재무제표", variable=self.fs_var, value="개별"
        ).grid(row=0, column=2, padx=10)

        self.biz_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            option_frame,
            text="사업보고서 분석 (매출구성, 생산능력, 수주현황 등)",
            variable=self.biz_var,
        ).grid(row=0, column=3, padx=20)

        # ── 저장 경로 ──
        path_frame = ttk.LabelFrame(self.root, text=" 저장 경로 ", padding=10)
        path_frame.pack(fill="x", padx=15, pady=5)

        self.save_dir_var = tk.StringVar(
            value=self.settings.get("save_dir", _find_desktop())
        )
        ttk.Entry(
            path_frame, textvariable=self.save_dir_var, width=50,
            font=("맑은 고딕", 10),
        ).pack(side="left", fill="x", expand=True, padx=(0, 10))
        ttk.Button(
            path_frame, text="폴더 선택", command=self._browse_folder
        ).pack(side="right")

        # ── 실행 버튼 ──
        btn_frame = ttk.Frame(self.root)
        btn_frame.pack(fill="x", padx=15, pady=10)

        self.run_btn = ttk.Button(
            btn_frame, text="  분석 시작  ", command=self._start_analysis
        )
        self.run_btn.pack(side="left")

        self.stop_btn = ttk.Button(
            btn_frame, text="중지", command=self._stop, state="disabled"
        )
        self.stop_btn.pack(side="left", padx=10)

        self.progress = ttk.Progressbar(
            btn_frame, mode="indeterminate", length=200
        )
        self.progress.pack(side="right")

        # ── 로그 ──
        log_frame = ttk.LabelFrame(self.root, text=" 진행 상황 ", padding=5)
        log_frame.pack(fill="both", expand=True, padx=15, pady=(5, 15))

        self.log_text = scrolledtext.ScrolledText(
            log_frame, height=18, font=("Consolas", 9),
            state="disabled", wrap="word",
        )
        self.log_text.pack(fill="both", expand=True)

        self.root.bind("<Return>", lambda e: self._start_analysis())

    def _browse_folder(self):
        folder = filedialog.askdirectory(
            title="엑셀 파일을 저장할 폴더를 선택하세요",
            initialdir=self.save_dir_var.get(),
        )
        if folder:
            self.save_dir_var.set(folder)

    def _log(self, msg):
        def _append():
            self.log_text.config(state="normal")
            self.log_text.insert("end", msg + "\n")
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        self.root.after(0, _append)

    def _save_current_settings(self):
        save_settings({
            "api_key": self.apikey_var.get().strip(),
            "save_dir": self.save_dir_var.get().strip(),
        })

    def _start_analysis(self):
        company = self.company_var.get().strip()
        period = self.period_var.get().strip()
        api_key = self.apikey_var.get().strip()

        if not company:
            messagebox.showwarning("입력 오류", "기업명을 입력해주세요.")
            return
        if not period:
            messagebox.showwarning(
                "입력 오류", "기간을 입력해주세요.\n예: 2024, 2020-2024"
            )
            return
        if not api_key:
            messagebox.showwarning(
                "API 키 필요",
                "DART API 키가 필요합니다.\n\n"
                "1. https://opendart.fss.or.kr 접속\n"
                "2. 회원가입 후 로그인\n"
                "3. 인증키 신청 → 발급받은 키 입력",
            )
            return

        try:
            parse_period(period)
        except ValueError as e:
            messagebox.showwarning("기간 오류", str(e))
            return

        self._save_current_settings()

        self.running = True
        self.run_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.progress.start(10)

        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

        thread = threading.Thread(
            target=self._run_analysis,
            args=(company, period, api_key),
            daemon=True,
        )
        thread.start()

    def _stop(self):
        self.running = False
        self._log("\n[중지] 사용자가 분석을 중지했습니다.")
        self._finish()

    def _finish(self):
        def _restore():
            self.running = False
            self.run_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
            self.progress.stop()
        self.root.after(0, _restore)

    def _run_analysis(self, company, period, api_key):
        try:
            fs_div = "CFS" if self.fs_var.get() == "연결" else "OFS"
            include_business = self.biz_var.get()
            start_year, end_year, _ = parse_period(period)

            self._log("=" * 55)
            self._log(f"  {company} 투자분석 시작")
            self._log(
                f"  기간: {start_year}~{end_year}년 | "
                f"{'연결' if fs_div == 'CFS' else '개별'}재무제표"
            )
            self._log("=" * 55)

            # ── 1. 기업 검색 ──
            self._log("\n[1/5] DART API 연결 & 기업 검색 중...")
            client = DartClient(api_key)
            parser = ReportParser(client)

            matches = client.search_corp(company)
            if not matches:
                self._log(f"\n  [오류] '{company}' 기업을 찾을 수 없습니다.")
                self._finish()
                return

            target = None
            for m in matches:
                if m["corp_name"] == company:
                    target = m
                    break
            if not target:
                target = matches[0]

            corp_code = target["corp_code"]
            self._log(f"  기업명: {target['corp_name']}")
            self._log(f"  종목코드: {target['stock_code'] or '(비상장)'}")

            if not self.running:
                return

            # ── 2. 기업 개황 ──
            self._log("\n[2/5] 기업 정보 조회 중...")
            company_info = client.get_company_info(corp_code)
            if company_info:
                for label, key in [
                    ("대표자", "ceo_nm"),
                    ("업종", "induty_code"),
                    ("설립일", "est_dt"),
                    ("홈페이지", "hm_url"),
                ]:
                    val = company_info.get(key, "")
                    if val:
                        self._log(f"  {label}: {val}")

            if not self.running:
                return

            # ── 3. 재무제표 크로스 테이블 ──
            self._log("\n[3/5] 재무제표 크로스 비교 테이블 생성 중...")
            cross_tables = client.get_yearly_cross_data(
                corp_code, start_year, end_year, fs_div,
                log_fn=self._log,
            )

            if cross_tables:
                for stmt_name, df in cross_tables.items():
                    self._log(f"  → {stmt_name}: {len(df)}개 계정과목")
            else:
                self._log("  [!] 재무제표 데이터가 없습니다.")

            if not self.running:
                return

            # ── 4. 투자지표 ──
            self._log("\n[4/5] 핵심 투자지표 계산 중...")
            metrics_df = None
            if cross_tables:
                metrics_df = calculate_investment_metrics(
                    cross_tables, start_year, end_year
                )
                self._log("  수익성: 영업이익률, 순이익률, ROE, ROA")
                self._log("  안정성: 부채비율, 유동비율, 자기자본비율")
                self._log("  성장성: 매출성장률, 영업이익성장률, 자산성장률")
                self._log("  현금흐름: FCF, 영업CF/매출액")

            if not self.running:
                return

            # ── 5. 사업보고서 ──
            business_data = {}
            if include_business:
                self._log("\n[5/5] 사업보고서 핵심 데이터 추출 중...")
                business_data = parser.get_yearly_business_data(
                    corp_code, start_year, end_year,
                    log_fn=self._log,
                )
            else:
                self._log("\n[5/5] 사업보고서 분석 건너뜀")

            if not self.running:
                return

            # ── 엑셀 저장 ──
            if not cross_tables and not business_data:
                self._log("\n[결과] 저장할 데이터가 없습니다.")
                self._finish()
                return

            save_dir = self.save_dir_var.get()
            os.makedirs(save_dir, exist_ok=True)

            safe_name = company.replace(" ", "_")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = (
                f"{safe_name}_{start_year}-{end_year}"
                f"_투자분석_{timestamp}.xlsx"
            )
            filepath = os.path.join(save_dir, filename)

            self._log("\n엑셀 파일 저장 중...")

            clean_tables = {}
            for stmt_name, df in cross_tables.items():
                clean_tables[stmt_name] = build_clean_statement(df, stmt_name)

            save_investment_excel(
                filepath=filepath,
                company_name=company,
                company_info=company_info,
                metrics_df=metrics_df,
                cross_tables=clean_tables,
                business_data=business_data,
                start_year=start_year,
                end_year=end_year,
            )

            self._log(f"\n{'=' * 55}")
            self._log("  분석 완료!")
            self._log("")
            self._log("  엑셀 시트 구성:")
            self._log("    1. 투자지표_요약 - ROE, 부채비율, 영업이익률 등")
            for stmt_name in clean_tables:
                self._log(
                    f"    - {stmt_name} - "
                    f"{start_year}~{end_year}년 연도별 비교"
                )
            if business_data:
                for year in sorted(business_data.keys()):
                    self._log(f"    - 사업내용_{year} - 매출구성, 생산, 수주 등")
            self._log("")
            self._log(f"  파일: {filepath}")
            self._log(f"{'=' * 55}")

            self.root.after(
                0,
                lambda: messagebox.showinfo(
                    "분석 완료",
                    f"투자분석이 완료되었습니다!\n\n"
                    f"기업: {company}\n"
                    f"기간: {start_year}~{end_year}년\n\n"
                    f"저장 위치:\n{filepath}",
                ),
            )

        except Exception as e:
            self._log(f"\n[오류] {type(e).__name__}: {e}")
            self._log(traceback.format_exc())
            self.root.after(
                0, lambda: messagebox.showerror("오류 발생", str(e))
            )

        finally:
            self._finish()


def main():
    root = tk.Tk()

    style = ttk.Style()
    try:
        style.theme_use("vista")
    except Exception:
        try:
            style.theme_use("clam")
        except Exception:
            pass

    DartAnalyzerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
