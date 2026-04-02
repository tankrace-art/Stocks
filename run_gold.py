"""KRX 금시장 데이터 수집 - GUI 버전

더블클릭으로 실행 가능한 GUI 프로그램입니다.
- 금 전종목 일별 시세 조회
- 금 1kg/100g/10g 기간별 시세 추이
- 엑셀 파일로 저장
"""

import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, filedialog
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from krx_gold.scraper import (
    get_gold_daily,
    get_gold_price_history,
    get_gold_intl,
    _latest_biz_day,
)

import pandas as pd

GOLD_ITEMS = {
    "금 1kg": "KRD040200002",
    "금 100g": "KRD040200001",
    "금 미니(10g)": "KRD040200003",
}


class KrxGoldApp:
    def __init__(self, root):
        self.root = root
        self.root.title("KRX 금시장 데이터 수집기")
        self.root.geometry("850x700")
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

        # ── 조회 모드 선택 ──
        mode_frame = ttk.LabelFrame(self.root, text=" 조회 모드 ", padding=10)
        mode_frame.pack(fill="x", padx=15, pady=(10, 5))

        self.mode_var = tk.StringVar(value="daily")
        ttk.Radiobutton(
            mode_frame, text="전종목 일별 시세", variable=self.mode_var,
            value="daily", command=self._on_mode_change,
        ).grid(row=0, column=0, padx=15)
        ttk.Radiobutton(
            mode_frame, text="종목별 기간 시세 추이", variable=self.mode_var,
            value="history", command=self._on_mode_change,
        ).grid(row=0, column=1, padx=15)
        ttk.Radiobutton(
            mode_frame, text="국제금시세 동향", variable=self.mode_var,
            value="intl", command=self._on_mode_change,
        ).grid(row=0, column=2, padx=15)

        # ── 입력 영역 ──
        input_frame = ttk.LabelFrame(self.root, text=" 조회 조건 ", padding=15)
        input_frame.pack(fill="x", padx=15, pady=5)
        self.input_frame = input_frame

        # 조회일 (daily 모드)
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

        # 종목 선택 (history 모드)
        ttk.Label(input_frame, text="종목:", font=("맑은 고딕", 11)).grid(
            row=1, column=0, sticky="w", pady=5
        )
        self.item_var = tk.StringVar(value="금 1kg")
        self.item_combo = ttk.Combobox(
            input_frame, textvariable=self.item_var,
            values=list(GOLD_ITEMS.keys()), state="readonly", width=13,
            font=("맑은 고딕", 11),
        )
        self.item_combo.grid(row=1, column=1, sticky="w", padx=(10, 5), pady=5)

        # 기간 (history 모드)
        ttk.Label(input_frame, text="시작일:", font=("맑은 고딕", 11)).grid(
            row=2, column=0, sticky="w", pady=5
        )
        default_start = (datetime.now() - timedelta(days=90)).strftime("%Y%m%d")
        self.start_var = tk.StringVar(value=default_start)
        self.start_entry = ttk.Entry(
            input_frame, textvariable=self.start_var, width=15, font=("맑은 고딕", 11)
        )
        self.start_entry.grid(row=2, column=1, sticky="w", padx=(10, 5), pady=5)

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
        for label, days in [("1개월", 30), ("3개월", 90), ("6개월", 180), ("1년", 365)]:
            ttk.Button(
                quick_frame, text=label, width=6,
                command=lambda d=days: self._set_period(d),
            ).pack(side="left", padx=2)

        input_frame.columnconfigure(2, weight=1)
        self._on_mode_change()

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
            btn_frame, text="  조회 시작  ", command=self._start,
        )
        self.run_btn.pack(side="left")

        self.save_btn = ttk.Button(
            btn_frame, text="  엑셀 저장  ", command=self._save_excel, state="disabled",
        )
        self.save_btn.pack(side="left", padx=10)

        self.progress = ttk.Progressbar(btn_frame, mode="indeterminate", length=200)
        self.progress.pack(side="right")

        # ── 결과 영역 ──
        log_frame = ttk.LabelFrame(self.root, text=" 조회 결과 ", padding=5)
        log_frame.pack(fill="both", expand=True, padx=15, pady=(5, 15))

        self.log_text = scrolledtext.ScrolledText(
            log_frame, height=18, font=("Consolas", 9), state="disabled", wrap="none"
        )
        self.log_text.pack(fill="both", expand=True)

        # 가로 스크롤
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
            self.item_combo.config(state="disabled")
            self.start_entry.config(state="disabled")
            self.end_entry.config(state="disabled")
        elif mode == "history":
            self.date_entry.config(state="disabled")
            self.item_combo.config(state="readonly")
            self.start_entry.config(state="normal")
            self.end_entry.config(state="normal")
        else:  # intl
            self.date_entry.config(state="disabled")
            self.item_combo.config(state="disabled")
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
        if self.running:
            return
        self.running = True
        self.run_btn.config(state="disabled")
        self.save_btn.config(state="disabled")
        self.progress.start(10)
        self._clear_log()
        self.last_df = None

        thread = threading.Thread(target=self._run, daemon=True)
        thread.start()

    def _finish(self):
        def _restore():
            self.running = False
            self.run_btn.config(state="normal")
            if self.last_df is not None and not self.last_df.empty:
                self.save_btn.config(state="normal")
            self.progress.stop()
        self.root.after(0, _restore)

    def _run(self):
        try:
            mode = self.mode_var.get()

            if mode == "daily":
                trd_dd = self.date_var.get().strip()
                self._log(f"[KRX 금시장] {trd_dd} 전종목 시세 조회 중...")
                self._log("")

                df = get_gold_daily(trd_dd, log_fn=self._log)
                self.last_df = df

                if df.empty:
                    self._log("데이터가 없습니다. 영업일인지 확인해주세요.")
                    self._log("")
                    self._log("참고: KRX 금시장은 평일에만 운영됩니다.")
                else:
                    self._log(f"총 {len(df)}개 종목 조회 완료")
                    self._log("")
                    self._log(df.to_string(index=False))

            elif mode == "history":
                start = self.start_var.get().strip()
                end = self.end_var.get().strip()
                item_name = self.item_var.get()
                isu_cd = GOLD_ITEMS[item_name]

                self._log(f"[KRX 금시장] {item_name} 시세 추이 조회 중...")
                df = get_gold_price_history(start, end, isu_cd, log_fn=self._log)
                self.last_df = df

                if df.empty:
                    self._log("데이터가 없습니다.")
                else:
                    self._log(f"총 {len(df)}일 데이터 조회 완료")
                    self._log("")
                    self._log(df.to_string(index=False))
                    self._show_stats(df, item_name)

            else:  # intl (국제금시세)
                start = self.start_var.get().strip()
                end = self.end_var.get().strip()

                self._log(f"[KRX 금시장] 국제금시세 동향 조회 중...")
                self._log(f"  기간: {start} ~ {end}")
                self._log("")

                df = get_gold_intl(start, end, log_fn=self._log)
                self.last_df = df

                if df.empty:
                    self._log("데이터가 없습니다.")
                else:
                    self._log(f"총 {len(df)}건 조회 완료")
                    self._log("")
                    self._log(df.to_string(index=False))

        except Exception as e:
            self._log(f"\n[오류] {type(e).__name__}: {e}")
            import traceback
            self._log(traceback.format_exc())

        finally:
            self._finish()

    def _show_stats(self, df, item_name):
        """간단 통계 출력"""
        numeric_cols = df.select_dtypes(include="number").columns
        price_col = None
        for candidate in ["TDD_CLSPRC", "종가", "CLSPRC", "ClsPrc"]:
            if candidate in df.columns:
                price_col = candidate
                break
        if price_col is None and len(numeric_cols) > 0:
            price_col = numeric_cols[0]

        if price_col and len(df) > 1:
            prices = pd.to_numeric(df[price_col], errors="coerce").dropna()
            if len(prices) > 0:
                self._log(f"\n{'=' * 50}")
                self._log(f"  {item_name} 기간 통계")
                self._log(f"{'=' * 50}")
                self._log(f"  최고가: {prices.max():>12,.0f} 원/g")
                self._log(f"  최저가: {prices.min():>12,.0f} 원/g")
                self._log(f"  평균가: {prices.mean():>12,.0f} 원/g")
                if prices.iloc[0] != 0:
                    change = (prices.iloc[-1] - prices.iloc[0]) / prices.iloc[0] * 100
                    self._log(f"  기간 수익률: {change:>+10.2f} %")

        vol_col = None
        for candidate in ["ACC_TRDVOL", "거래량", "TRDVOL", "TrdVol"]:
            if candidate in df.columns:
                vol_col = candidate
                break
        if vol_col:
            vols = pd.to_numeric(df[vol_col], errors="coerce").dropna()
            if len(vols) > 0:
                self._log(f"  총 거래량: {vols.sum():>10,.0f} g")
                self._log(f"  일평균 거래량: {vols.mean():>8,.0f} g")

    def _save_excel(self):
        if self.last_df is None or self.last_df.empty:
            messagebox.showwarning("저장 오류", "저장할 데이터가 없습니다.")
            return

        save_dir = self.save_dir_var.get()
        os.makedirs(save_dir, exist_ok=True)

        mode = self.mode_var.get()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if mode == "daily":
            trd_dd = self.date_var.get().strip()
            filename = f"KRX금시장_전종목_{trd_dd}_{timestamp}.xlsx"
            sheet = f"금전종목_{trd_dd}"
        else:
            item = self.item_var.get().replace(" ", "")
            start = self.start_var.get().strip()
            end = self.end_var.get().strip()
            filename = f"KRX금시장_{item}_{start}_{end}_{timestamp}.xlsx"
            sheet = f"{item}_{start}_{end}"

        filepath = os.path.join(save_dir, filename)

        try:
            self.last_df.to_excel(filepath, sheet_name=sheet[:31], index=False)
            messagebox.showinfo("저장 완료", f"엑셀 파일이 저장되었습니다.\n\n{filepath}")
        except Exception as e:
            messagebox.showerror("저장 오류", str(e))


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
