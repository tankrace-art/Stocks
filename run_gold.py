"""KRX 금시장 데이터 수집 - GUI 버전

KRX Open API를 사용하여 금 현물 시세를 조회합니다.

API 키 발급:
  1. https://openapi.krx.co.kr 회원가입
  2. [마이페이지] → 인증키 신청
  3. [서비스 신청] → 일반상품 신청
"""

import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from krx_gold.scraper import get_gold_daily, get_gold_price_history, _latest_biz_day
from krx_gold.excel_writer import save_cumulative_excel, normalize_dataframe

import pandas as pd


def format_df_for_display(df: pd.DataFrame) -> pd.DataFrame:
    """숫자 컬럼을 천단위 콤마 포함 문자열로 변환 (화면 표시용).

    원본 DataFrame은 건드리지 않고 새 복사본을 반환한다.
    """
    if df is None or df.empty:
        return df

    display = df.copy()
    # 정수로 표시할 컬럼
    int_cols = ["종가", "대비", "시가", "고가", "저가", "거래량", "거래대금"]
    # 소수점 2자리로 표시할 컬럼
    float_cols = ["등락률", "등락률(%)"]

    for col in display.columns:
        if col in int_cols:
            display[col] = pd.to_numeric(display[col], errors="coerce").apply(
                lambda x: f"{int(x):,}" if pd.notna(x) else ""
            )
        elif col in float_cols:
            display[col] = pd.to_numeric(display[col], errors="coerce").apply(
                lambda x: f"{x:+.2f}" if pd.notna(x) else ""
            )

    return display

# 누적 저장 파일명 (한 파일에 계속 누적)
CUMULATIVE_FILENAME = "KRX금시장_누적.xlsx"

# API 키 저장 파일
CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".krx_gold")
CONFIG_FILE = os.path.join(CONFIG_DIR, "api_key.txt")


def _load_api_key() -> str:
    try:
        with open(CONFIG_FILE, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def _save_api_key(key: str):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        f.write(key)


class KrxGoldApp:
    def __init__(self, root):
        self.root = root
        self.root.title("KRX 금시장 데이터 수집기")
        self.root.geometry("850x750")
        self.root.resizable(True, True)
        self._build_ui()
        self.running = False

    def _build_ui(self):
        # ── 상단 타이틀 ──
        title_frame = ttk.Frame(self.root)
        title_frame.pack(fill="x", padx=15, pady=(10, 0))
        ttk.Label(
            title_frame,
            text="KRX 금시장 데이터 수집기",
            font=("맑은 고딕", 16, "bold"),
        ).pack(side="left")
        ttk.Label(
            title_frame,
            text="한국거래소 금 현물 가격/거래량 조회",
            foreground="gray",
            font=("맑은 고딕", 9),
        ).pack(side="right", pady=5)

        # ── API 키 입력 ──
        api_frame = ttk.LabelFrame(self.root, text=" KRX Open API 인증키 ", padding=10)
        api_frame.pack(fill="x", padx=15, pady=(10, 5))

        self.api_key_var = tk.StringVar(value=_load_api_key())
        ttk.Entry(
            api_frame, textvariable=self.api_key_var, width=50,
            font=("맑은 고딕", 10), show="*",
        ).pack(side="left", fill="x", expand=True, padx=(0, 10))

        ttk.Button(api_frame, text="키 저장", command=self._save_key).pack(side="left", padx=5)
        ttk.Button(api_frame, text="발급 안내", command=self._show_api_guide).pack(side="right")

        # ── 조회 모드 선택 ──
        mode_frame = ttk.LabelFrame(self.root, text=" 조회 모드 ", padding=10)
        mode_frame.pack(fill="x", padx=15, pady=5)

        self.mode_var = tk.StringVar(value="history")
        ttk.Radiobutton(
            mode_frame, text="기간별 시세 추이 (금 1kg)", variable=self.mode_var,
            value="history", command=self._on_mode_change,
        ).grid(row=0, column=0, padx=15)
        ttk.Radiobutton(
            mode_frame, text="특정일 시세", variable=self.mode_var,
            value="daily", command=self._on_mode_change,
        ).grid(row=0, column=1, padx=15)

        # ── 입력 영역 ──
        input_frame = ttk.LabelFrame(self.root, text=" 조회 조건 ", padding=15)
        input_frame.pack(fill="x", padx=15, pady=5)

        # 조회일
        ttk.Label(input_frame, text="조회일:", font=("맑은 고딕", 11)).grid(
            row=0, column=0, sticky="w", pady=5
        )
        self.date_var = tk.StringVar(value=_latest_biz_day())
        self.date_entry = ttk.Entry(
            input_frame, textvariable=self.date_var, width=15, font=("맑은 고딕", 11)
        )
        self.date_entry.grid(row=0, column=1, sticky="w", padx=(10, 5), pady=5)
        ttk.Label(input_frame, text="YYYYMMDD 형식", foreground="gray").grid(
            row=0, column=2, sticky="w", padx=5
        )

        # 종목 (금 1kg 고정)
        ttk.Label(input_frame, text="종목:", font=("맑은 고딕", 11)).grid(
            row=1, column=0, sticky="w", pady=5
        )
        ttk.Label(
            input_frame, text="금 99.99 1kg (고정)",
            font=("맑은 고딕", 11), foreground="#1f77b4",
        ).grid(row=1, column=1, sticky="w", padx=(10, 5), pady=5)

        # 시작일
        ttk.Label(input_frame, text="시작일:", font=("맑은 고딕", 11)).grid(
            row=2, column=0, sticky="w", pady=5
        )
        default_start = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")
        self.start_var = tk.StringVar(value=default_start)
        self.start_entry = ttk.Entry(
            input_frame, textvariable=self.start_var, width=15, font=("맑은 고딕", 11)
        )
        self.start_entry.grid(row=2, column=1, sticky="w", padx=(10, 5), pady=5)

        # 종료일
        ttk.Label(input_frame, text="종료일:", font=("맑은 고딕", 11)).grid(
            row=3, column=0, sticky="w", pady=5
        )
        self.end_var = tk.StringVar(value=datetime.now().strftime("%Y%m%d"))
        self.end_entry = ttk.Entry(
            input_frame, textvariable=self.end_var, width=15, font=("맑은 고딕", 11)
        )
        self.end_entry.grid(row=3, column=1, sticky="w", padx=(10, 5), pady=5)

        # 빠른 기간 버튼
        quick_frame = ttk.Frame(input_frame)
        quick_frame.grid(row=2, column=2, rowspan=2, sticky="w", padx=10)
        for label, days in [("1주", 7), ("1개월", 30), ("3개월", 90), ("6개월", 180)]:
            ttk.Button(
                quick_frame, text=label, width=6,
                command=lambda d=days: self._set_period(d),
            ).pack(side="left", padx=2)

        input_frame.columnconfigure(2, weight=1)
        self._on_mode_change()

        # ── 저장 경로 ──
        path_frame = ttk.LabelFrame(self.root, text=" 저장 경로 ", padding=10)
        path_frame.pack(fill="x", padx=15, pady=5)

        # 기본 저장 경로 = 스크립트가 있는 폴더 (C:\Users\...\Documents\Stocks)
        default_save_dir = os.path.dirname(os.path.abspath(__file__))
        self.save_dir_var = tk.StringVar(value=default_save_dir)
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
            btn_frame, text="  조회 + 자동 저장  ", command=self._start,
        )
        self.run_btn.pack(side="left")

        ttk.Label(
            btn_frame,
            text=" ※ 조회 완료 시 자동으로 KRX금시장_누적.xlsx에 저장됩니다",
            foreground="gray", font=("맑은 고딕", 9),
        ).pack(side="left", padx=10)

        self.progress = ttk.Progressbar(btn_frame, mode="indeterminate", length=200)
        self.progress.pack(side="right")

        # ── 결과 영역 ──
        log_frame = ttk.LabelFrame(self.root, text=" 조회 결과 ", padding=5)
        log_frame.pack(fill="both", expand=True, padx=15, pady=(5, 15))

        self.log_text = scrolledtext.ScrolledText(
            log_frame, height=14, font=("Consolas", 9), state="disabled", wrap="none"
        )
        self.log_text.pack(fill="both", expand=True)

        h_scroll = ttk.Scrollbar(log_frame, orient="horizontal",
                                  command=self.log_text.xview)
        h_scroll.pack(fill="x")
        self.log_text.config(xscrollcommand=h_scroll.set)

        self.root.bind("<Return>", lambda e: self._start())
        self.last_df = None

    def _on_mode_change(self):
        mode = self.mode_var.get()
        if mode == "daily":
            self.date_entry.config(state="normal")
            self.start_entry.config(state="disabled")
            self.end_entry.config(state="disabled")
        else:
            self.date_entry.config(state="disabled")
            self.start_entry.config(state="normal")
            self.end_entry.config(state="normal")

    def _set_period(self, days):
        self.start_var.set((datetime.now() - timedelta(days=days)).strftime("%Y%m%d"))
        self.end_var.set(datetime.now().strftime("%Y%m%d"))

    def _browse_folder(self):
        folder = filedialog.askdirectory(
            title="저장 폴더 선택",
            initialdir=self.save_dir_var.get(),
        )
        if folder:
            self.save_dir_var.set(folder)

    def _save_key(self):
        key = self.api_key_var.get().strip()
        if key:
            _save_api_key(key)
            messagebox.showinfo("저장 완료", "API 키가 저장되었습니다.\n다음 실행 시 자동으로 불러옵니다.")
        else:
            messagebox.showwarning("입력 오류", "API 키를 입력해주세요.")

    def _show_api_guide(self):
        messagebox.showinfo(
            "KRX Open API 인증키 발급 안내",
            "※ 인증키 발급 + 서비스 신청 둘 다 필요합니다!\n\n"
            "1. https://openapi.krx.co.kr 접속\n"
            "2. 회원가입 후 로그인\n"
            "3. [마이페이지] → [인증키 신청] 클릭\n"
            "4. 인증키 발급 (즉시 발급)\n\n"
            "★ 중요! 아래도 반드시 해주세요 ★\n"
            "5. [서비스 신청] → [일반상품] 체크 후 신청\n"
            "   (이걸 안 하면 401 에러 발생)\n\n"
            "6. 발급받은 인증키를 위 입력란에 붙여넣기\n\n"
            "* 무료, 일 10,000회 호출 가능\n"
            "* 2010년 이후 데이터 제공\n"
            "* 승인까지 최대 1일 소요",
        )

    def _log(self, msg):
        def _append():
            self.log_text.config(state="normal")
            self.log_text.insert("end", msg + "\n")
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        self.root.after(0, _append)

    def _clear_log(self):
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

    def _start(self):
        api_key = self.api_key_var.get().strip()
        if not api_key:
            self._show_api_guide()
            return

        if self.running:
            return
        self.running = True
        self.run_btn.config(state="disabled")
        self.progress.start(10)
        self._clear_log()
        self.last_df = None

        thread = threading.Thread(target=self._run, args=(api_key,), daemon=True)
        thread.start()

    def _finish(self):
        def _restore():
            self.running = False
            self.run_btn.config(state="normal")
            self.progress.stop()
        self.root.after(0, _restore)

    def _run(self, api_key):
        try:
            mode = self.mode_var.get()
            # 금 1kg만 필터 (미니금 제외)
            item_filter = "1kg"

            if mode == "daily":
                trd_dd = self.date_var.get().strip()
                self._log(f"[KRX 금시장] {trd_dd} 금 1kg 시세 조회 중...")
                self._log("")

                df = get_gold_daily(trd_dd, api_key=api_key, log_fn=self._log)
                df = normalize_dataframe(df)

                # 금 1kg만 필터
                if not df.empty and "종목명" in df.columns:
                    df = df[df["종목명"].str.contains("1kg", case=False, na=False)]
                    df = df.reset_index(drop=True)

                self.last_df = df
                self.last_item = "금 1kg"

                if df.empty:
                    self._log("\n데이터가 없습니다. 영업일인지 확인해주세요.")
                    self._log("(KRX 금시장은 평일에만 운영됩니다)")
                else:
                    self._log(f"\n조회 완료\n")
                    self._log(format_df_for_display(df).to_string(index=False))

            else:  # history
                start = self.start_var.get().strip()
                end = self.end_var.get().strip()

                self._log(f"[KRX 금시장] 금 1kg 기간별 시세 추이 조회 중...")
                self._log("")

                df = get_gold_price_history(
                    start, end, api_key=api_key,
                    item_filter=item_filter, log_fn=self._log,
                )
                df = normalize_dataframe(df)
                self.last_df = df
                self.last_item = "금 1kg"

                if df.empty:
                    self._log("\n데이터가 없습니다.")
                else:
                    self._log(f"\n{format_df_for_display(df).to_string(index=False)}")
                    self._show_stats(df)

            # ── 조회 성공 시 자동 저장 ──
            if self.last_df is not None and not self.last_df.empty:
                self._auto_save()

        except ValueError as e:
            self._log(f"\n[설정 오류] {e}")
        except Exception as e:
            self._log(f"\n[오류] {type(e).__name__}: {e}")
            import traceback
            self._log(traceback.format_exc())
        finally:
            self._finish()

    def _auto_save(self):
        """조회 완료 후 자동으로 누적 엑셀 저장"""
        save_dir = self.save_dir_var.get()
        try:
            os.makedirs(save_dir, exist_ok=True)
        except Exception as e:
            self._log(f"\n[저장 오류] 폴더 생성 실패: {e}")
            return

        filepath = os.path.join(save_dir, CUMULATIVE_FILENAME)
        self._log(f"\n[자동 저장] {filepath}")

        try:
            row_count = save_cumulative_excel(
                self.last_df,
                filepath=filepath,
                sheet_name="금시세",
                item_name=None,
                log_fn=self._log,
            )
            self._log(f"  → 총 {row_count}행 저장됨 (누적, 차트 포함)")
        except PermissionError:
            self._log(
                "  [저장 실패] 엑셀 파일이 열려 있습니다.\n"
                "  Excel에서 파일을 닫고 다시 조회해주세요."
            )
        except Exception as e:
            import traceback
            self._log(f"  [저장 오류] {e}")
            self._log(traceback.format_exc())

    def _show_stats(self, df):
        if "종가" in df.columns:
            prices = pd.to_numeric(df["종가"], errors="coerce").dropna()
            if len(prices) > 1:
                self._log(f"\n{'=' * 50}")
                self._log(f"  기간 통계")
                self._log(f"{'=' * 50}")
                self._log(f"  최고가: {prices.max():>12,.0f}")
                self._log(f"  최저가: {prices.min():>12,.0f}")
                self._log(f"  평균가: {prices.mean():>12,.0f}")
                if prices.iloc[0] != 0:
                    chg = (prices.iloc[-1] - prices.iloc[0]) / prices.iloc[0] * 100
                    self._log(f"  기간 수익률: {chg:>+10.2f} %")

        if "거래량" in df.columns:
            vols = pd.to_numeric(df["거래량"], errors="coerce").dropna()
            if len(vols) > 0:
                self._log(f"  총 거래량: {vols.sum():>12,.0f} g")
                self._log(f"  일평균 거래량: {vols.mean():>10,.0f} g")


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
    KrxGoldApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
