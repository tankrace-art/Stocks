"""DART 재무데이터 크롤러 - GUI 버전

더블클릭으로 실행 가능한 GUI 프로그램입니다.
기업명과 기간을 입력하면 재무데이터를 크롤링하여 엑셀로 저장합니다.
"""

import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog
from datetime import datetime

# 프로젝트 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dart_scraper.config import DART_API_KEY
from dart_scraper.dart_client import DartClient
from dart_scraper.report_parser import ReportParser
from dart_scraper.utils import parse_period, save_to_excel


class DartScraperApp:
    def __init__(self, root):
        self.root = root
        self.root.title("DART 재무데이터 크롤러")
        self.root.geometry("750x650")
        self.root.resizable(True, True)

        # 아이콘 설정 (없어도 동작)
        try:
            self.root.iconbitmap(default="")
        except Exception:
            pass

        self._build_ui()
        self.running = False

    def _build_ui(self):
        # ── 상단: 입력 영역 ──
        input_frame = ttk.LabelFrame(self.root, text=" 검색 조건 ", padding=15)
        input_frame.pack(fill="x", padx=15, pady=(15, 5))

        # 기업명
        ttk.Label(input_frame, text="기업명:", font=("맑은 고딕", 11)).grid(
            row=0, column=0, sticky="w", pady=5
        )
        self.company_var = tk.StringVar()
        company_entry = ttk.Entry(
            input_frame, textvariable=self.company_var, width=30, font=("맑은 고딕", 11)
        )
        company_entry.grid(row=0, column=1, sticky="ew", padx=(10, 5), pady=5)
        company_entry.focus()

        ttk.Label(
            input_frame, text="예: 삼성전자, SK하이닉스", foreground="gray"
        ).grid(row=0, column=2, sticky="w", padx=5)

        # 기간
        ttk.Label(input_frame, text="기간:", font=("맑은 고딕", 11)).grid(
            row=1, column=0, sticky="w", pady=5
        )
        self.period_var = tk.StringVar()
        period_entry = ttk.Entry(
            input_frame, textvariable=self.period_var, width=30, font=("맑은 고딕", 11)
        )
        period_entry.grid(row=1, column=1, sticky="ew", padx=(10, 5), pady=5)

        ttk.Label(
            input_frame,
            text="예: 2024, 2020-2024, 2023 분기",
            foreground="gray",
        ).grid(row=1, column=2, sticky="w", padx=5)

        # API 키
        ttk.Label(input_frame, text="API 키:", font=("맑은 고딕", 11)).grid(
            row=2, column=0, sticky="w", pady=5
        )
        self.apikey_var = tk.StringVar(value=DART_API_KEY)
        apikey_entry = ttk.Entry(
            input_frame, textvariable=self.apikey_var, width=30, font=("맑은 고딕", 11),
            show="*"
        )
        apikey_entry.grid(row=2, column=1, sticky="ew", padx=(10, 5), pady=5)

        ttk.Label(
            input_frame,
            text="opendart.fss.or.kr 에서 발급",
            foreground="gray",
        ).grid(row=2, column=2, sticky="w", padx=5)

        input_frame.columnconfigure(1, weight=1)

        # ── 옵션 영역 ──
        option_frame = ttk.LabelFrame(self.root, text=" 옵션 ", padding=10)
        option_frame.pack(fill="x", padx=15, pady=5)

        # 재무제표 구분
        ttk.Label(option_frame, text="재무제표:").grid(row=0, column=0, sticky="w")
        self.fs_var = tk.StringVar(value="연결")
        ttk.Radiobutton(option_frame, text="연결재무제표", variable=self.fs_var, value="연결").grid(
            row=0, column=1, padx=10
        )
        ttk.Radiobutton(option_frame, text="개별재무제표", variable=self.fs_var, value="개별").grid(
            row=0, column=2, padx=10
        )

        # 사업내용 포함
        self.biz_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            option_frame, text="사업내용 분석 포함 (매출유형, 생산능력 등)", variable=self.biz_var
        ).grid(row=0, column=3, padx=20)

        # ── 저장 경로 ──
        path_frame = ttk.LabelFrame(self.root, text=" 저장 경로 ", padding=10)
        path_frame.pack(fill="x", padx=15, pady=5)

        self.save_dir_var = tk.StringVar(
            value=os.path.join(os.path.expanduser("~"), "Desktop")
        )
        ttk.Entry(
            path_frame, textvariable=self.save_dir_var, width=50, font=("맑은 고딕", 10)
        ).pack(side="left", fill="x", expand=True, padx=(0, 10))
        ttk.Button(path_frame, text="폴더 선택", command=self._browse_folder).pack(
            side="right"
        )

        # ── 실행 버튼 ──
        btn_frame = ttk.Frame(self.root)
        btn_frame.pack(fill="x", padx=15, pady=10)

        self.run_btn = ttk.Button(
            btn_frame,
            text="  크롤링 시작  ",
            command=self._start_crawl,
        )
        self.run_btn.pack(side="left")

        self.stop_btn = ttk.Button(
            btn_frame, text="중지", command=self._stop_crawl, state="disabled"
        )
        self.stop_btn.pack(side="left", padx=10)

        self.progress = ttk.Progressbar(btn_frame, mode="indeterminate", length=200)
        self.progress.pack(side="right")

        # ── 로그 영역 ──
        log_frame = ttk.LabelFrame(self.root, text=" 진행 상황 ", padding=5)
        log_frame.pack(fill="both", expand=True, padx=15, pady=(5, 15))

        self.log_text = scrolledtext.ScrolledText(
            log_frame, height=15, font=("Consolas", 9), state="disabled", wrap="word"
        )
        self.log_text.pack(fill="both", expand=True)

        # Enter 키로도 실행
        self.root.bind("<Return>", lambda e: self._start_crawl())

    def _browse_folder(self):
        folder = filedialog.askdirectory(
            title="엑셀 파일을 저장할 폴더를 선택하세요",
            initialdir=self.save_dir_var.get(),
        )
        if folder:
            self.save_dir_var.set(folder)

    def _log(self, msg):
        """로그 메시지 추가 (스레드 안전)"""
        def _append():
            self.log_text.config(state="normal")
            self.log_text.insert("end", msg + "\n")
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        self.root.after(0, _append)

    def _start_crawl(self):
        # 입력 검증
        company = self.company_var.get().strip()
        period = self.period_var.get().strip()
        api_key = self.apikey_var.get().strip()

        if not company:
            messagebox.showwarning("입력 오류", "기업명을 입력해주세요.")
            return
        if not period:
            messagebox.showwarning("입력 오류", "기간을 입력해주세요.\n예: 2024, 2020-2024, 2023 분기")
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

        # 기간 검증
        try:
            parse_period(period)
        except ValueError as e:
            messagebox.showwarning("기간 오류", str(e))
            return

        # UI 상태 변경
        self.running = True
        self.run_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.progress.start(10)

        # 로그 초기화
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

        # 백그라운드 스레드에서 크롤링 실행
        thread = threading.Thread(
            target=self._run_crawl,
            args=(company, period, api_key),
            daemon=True,
        )
        thread.start()

    def _stop_crawl(self):
        self.running = False
        self._log("\n[중지] 사용자가 크롤링을 중지했습니다.")
        self._finish()

    def _finish(self):
        """크롤링 완료 후 UI 복구"""
        def _restore():
            self.running = False
            self.run_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
            self.progress.stop()
        self.root.after(0, _restore)

    def _run_crawl(self, company, period, api_key):
        """백그라운드에서 크롤링 실행"""
        try:
            self._log(f"{'='*50}")
            self._log(f"  {company} 재무데이터 크롤링 시작")
            self._log(f"  기간: {period}")
            self._log(f"{'='*50}")

            fs_div = "CFS" if self.fs_var.get() == "연결" else "OFS"
            include_business = self.biz_var.get()

            # 클라이언트 초기화
            self._log("\n[1/5] DART API 연결 중...")
            client = DartClient(api_key)
            parser = ReportParser(client)

            # 기간 파싱
            start_year, end_year, report_types = parse_period(period)
            self._log(f"  분석기간: {start_year}~{end_year}년")
            self._log(f"  보고서: {', '.join(report_types)}")
            self._log(f"  재무제표: {'연결' if fs_div == 'CFS' else '개별'}")

            if not self.running:
                return

            # 기업 검색
            self._log("\n[2/5] 기업 검색 중...")
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
            self._log(f"  고유번호: {corp_code}")
            self._log(f"  종목코드: {target['stock_code'] or '(비상장)'}")

            if not self.running:
                return

            # 기업 개황
            self._log("\n[3/5] 기업 정보 조회 중...")
            info = client.get_company_info(corp_code)
            if info:
                for label, key in [
                    ("대표자", "ceo_nm"),
                    ("업종코드", "induty_code"),
                    ("설립일", "est_dt"),
                    ("홈페이지", "hm_url"),
                ]:
                    val = info.get(key, "")
                    if val:
                        self._log(f"  {label}: {val}")

            if not self.running:
                return

            # 재무제표 조회
            self._log("\n[4/5] 재무제표 크롤링 중... (시간이 걸릴 수 있습니다)")
            all_excel_data = {}

            financial_data = client.get_multi_year_financials(
                corp_code, start_year, end_year, report_types, fs_div
            )

            if financial_data:
                for period_key, statements in financial_data.items():
                    if not self.running:
                        return
                    self._log(f"  ✓ {period_key} 조회 완료")
                    for stmt_name, df in statements.items():
                        if not df.empty:
                            all_excel_data[f"{period_key}_{stmt_name}"] = df
                self._log(f"  → 총 {len(all_excel_data)}개 재무제표 시트 수집")
            else:
                self._log("  [!] 조회된 재무제표가 없습니다.")

            if not self.running:
                return

            # 사업내용 분석
            if include_business:
                self._log("\n[5/5] 사업내용 분석 중...")
                for year in range(start_year, end_year + 1):
                    if not self.running:
                        return
                    self._log(f"  {year}년 사업보고서 분석 중...")
                    sections = parser.parse_business_content(corp_code, year)
                    if sections:
                        for section_name, tables in sections.items():
                            for i, df in enumerate(tables):
                                if not df.empty:
                                    key = f"{year}년_{section_name}"
                                    if i > 0:
                                        key += f"_{i+1}"
                                    all_excel_data[key] = df
                        self._log(f"  ✓ {year}년 사업보고서 완료")
                    else:
                        self._log(f"  - {year}년 사업보고서 없음")
            else:
                self._log("\n[5/5] 사업내용 분석 건너뜀")

            if not self.running:
                return

            # 엑셀 저장
            if not all_excel_data:
                self._log("\n[결과] 저장할 데이터가 없습니다.")
                self._finish()
                return

            save_dir = self.save_dir_var.get()
            os.makedirs(save_dir, exist_ok=True)

            safe_name = company.replace(" ", "_")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{safe_name}_{start_year}-{end_year}_재무분석_{timestamp}.xlsx"
            filepath = os.path.join(save_dir, filename)

            import pandas as pd
            with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
                import re
                for sheet_name, df in all_excel_data.items():
                    safe_sheet = re.sub(r'[\\/*?\[\]:]', '_', sheet_name[:31])
                    df.to_excel(writer, sheet_name=safe_sheet, index=False)

            self._log(f"\n{'='*50}")
            self._log(f"  크롤링 완료!")
            self._log(f"  총 {len(all_excel_data)}개 시트 저장")
            self._log(f"  파일: {filepath}")
            self._log(f"{'='*50}")

            # 완료 메시지
            self.root.after(0, lambda: messagebox.showinfo(
                "완료",
                f"크롤링이 완료되었습니다!\n\n"
                f"기업: {company}\n"
                f"기간: {start_year}~{end_year}년\n"
                f"시트 수: {len(all_excel_data)}개\n\n"
                f"저장 위치:\n{filepath}",
            ))

        except Exception as e:
            self._log(f"\n[오류] {type(e).__name__}: {e}")
            self.root.after(0, lambda: messagebox.showerror("오류 발생", str(e)))

        finally:
            self._finish()


def main():
    root = tk.Tk()

    # 스타일 설정
    style = ttk.Style()
    try:
        style.theme_use("vista")  # Windows 용
    except Exception:
        try:
            style.theme_use("clam")
        except Exception:
            pass

    app = DartScraperApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
