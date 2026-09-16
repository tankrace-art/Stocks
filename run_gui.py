"""DART 재무분석 투자도구 - GUI 실행파일

더블클릭으로 실행:
  Windows: 재무분석_실행.bat 더블클릭
  macOS/Linux: 재무분석_실행.command 더블클릭

기업명·기간·옵션을 GUI에서 입력하면 Phase 1~4 전체가 실행됩니다:
  Phase 1: 사용자 엑셀 포맷 (연간·분기·재고·사업부문·매입처·판매채널·임직원)
  Phase 2: 경쟁사 일괄 비교
  Phase 3: 뉴스·IR 수집 (선택적 LLM 요약)
  Phase 4: 공부 노트 자동 분류
"""

import os
import sys
import threading
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, scrolledtext, ttk

# 프로젝트 경로
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dart_scraper.config import DART_API_KEY
from dart_scraper.main import run_full_analysis
from dart_scraper.utils import parse_period


CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gui_config")


def load_saved_config() -> dict:
    """마지막 실행 시의 입력값 복원"""
    cfg = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        cfg[k] = v
        except (OSError, ValueError):
            pass
    return cfg


def save_config(cfg: dict):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            for k, v in cfg.items():
                f.write(f"{k}={v}\n")
    except OSError:
        pass


class DartAnalyzerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("DART 투자분석 자동화 (Phase 1~4)")
        self.root.geometry("880x820")
        self.root.resizable(True, True)

        self.saved = load_saved_config()
        self._build_ui()
        self.running = False

    def _build_ui(self):
        # ── 상단 타이틀 ──
        title_frame = ttk.Frame(self.root)
        title_frame.pack(fill="x", padx=15, pady=(10, 0))
        ttk.Label(
            title_frame,
            text="DART 투자분석 자동화",
            font=("맑은 고딕", 16, "bold"),
        ).pack(side="left")
        ttk.Label(
            title_frame,
            text="종목명 입력 → 엑셀 자동 생성",
            foreground="gray",
            font=("맑은 고딕", 9),
        ).pack(side="right", pady=5)

        # ── 기본 입력 ──
        input_frame = ttk.LabelFrame(self.root, text=" 기본 정보 ", padding=15)
        input_frame.pack(fill="x", padx=15, pady=(10, 5))

        ttk.Label(input_frame, text="기업명:", font=("맑은 고딕", 11)).grid(
            row=0, column=0, sticky="w", pady=5
        )
        self.company_var = tk.StringVar(value=self.saved.get("company", ""))
        company_entry = ttk.Entry(
            input_frame, textvariable=self.company_var, width=30, font=("맑은 고딕", 11)
        )
        company_entry.grid(row=0, column=1, sticky="ew", padx=(10, 5), pady=5)
        company_entry.focus()
        ttk.Label(input_frame, text="예: 에이피알, 삼성전자", foreground="gray").grid(
            row=0, column=2, sticky="w", padx=5
        )

        ttk.Label(input_frame, text="기간:", font=("맑은 고딕", 11)).grid(
            row=1, column=0, sticky="w", pady=5
        )
        self.period_var = tk.StringVar(value=self.saved.get("period", "2018-2025"))
        ttk.Entry(
            input_frame, textvariable=self.period_var, width=30, font=("맑은 고딕", 11)
        ).grid(row=1, column=1, sticky="ew", padx=(10, 5), pady=5)
        ttk.Label(input_frame, text="예: 2024, 2018-2025", foreground="gray").grid(
            row=1, column=2, sticky="w", padx=5
        )

        ttk.Label(input_frame, text="DART API 키:", font=("맑은 고딕", 11)).grid(
            row=2, column=0, sticky="w", pady=5
        )
        self.apikey_var = tk.StringVar(
            value=self.saved.get("api_key", DART_API_KEY)
        )
        ttk.Entry(
            input_frame, textvariable=self.apikey_var, width=30,
            font=("맑은 고딕", 11), show="*"
        ).grid(row=2, column=1, sticky="ew", padx=(10, 5), pady=5)
        ttk.Label(
            input_frame, text="opendart.fss.or.kr 에서 발급", foreground="gray"
        ).grid(row=2, column=2, sticky="w", padx=5)

        input_frame.columnconfigure(1, weight=1)

        # ── 재무제표 옵션 ──
        option_frame = ttk.LabelFrame(self.root, text=" 재무제표 옵션 ", padding=10)
        option_frame.pack(fill="x", padx=15, pady=5)

        ttk.Label(option_frame, text="재무제표:").grid(row=0, column=0, sticky="w")
        self.fs_var = tk.StringVar(value=self.saved.get("fs", "연결"))
        ttk.Radiobutton(
            option_frame, text="연결재무제표", variable=self.fs_var, value="연결"
        ).grid(row=0, column=1, padx=10)
        ttk.Radiobutton(
            option_frame, text="개별재무제표", variable=self.fs_var, value="개별"
        ).grid(row=0, column=2, padx=10)

        self.quarterly_var = tk.BooleanVar(
            value=self.saved.get("quarterly", "1") == "1"
        )
        ttk.Checkbutton(
            option_frame, text="분기별 데이터 포함 (최근 3년, 시간 좀 더 걸림)",
            variable=self.quarterly_var,
        ).grid(row=0, column=3, padx=20)

        # ── 확장 기능 (Phase 2~4) ──
        ext_frame = ttk.LabelFrame(self.root, text=" 확장 기능 (선택) ", padding=10)
        ext_frame.pack(fill="x", padx=15, pady=5)

        # Phase 2: 경쟁사
        ttk.Label(ext_frame, text="경쟁사 (쉼표):").grid(row=0, column=0, sticky="w", pady=3)
        self.comp_var = tk.StringVar(value=self.saved.get("competitors", ""))
        ttk.Entry(ext_frame, textvariable=self.comp_var, width=45).grid(
            row=0, column=1, sticky="ew", padx=(10, 5), pady=3
        )
        ttk.Label(ext_frame, text="예: 아모레퍼시픽,LG생활건강", foreground="gray").grid(
            row=0, column=2, sticky="w", padx=5
        )

        # Phase 3: 뉴스
        self.news_var = tk.BooleanVar(value=self.saved.get("news", "0") == "1")
        ttk.Checkbutton(
            ext_frame,
            text="뉴스·IR 공시 수집 (Anthropic API 키 있으면 자동 요약)",
            variable=self.news_var,
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=3)

        # Phase 4: 노트
        ttk.Label(ext_frame, text="공부 노트 폴더:").grid(row=2, column=0, sticky="w", pady=3)
        self.notes_var = tk.StringVar(value=self.saved.get("notes", ""))
        notes_entry_frame = ttk.Frame(ext_frame)
        notes_entry_frame.grid(row=2, column=1, columnspan=2, sticky="ew", padx=(10, 5), pady=3)
        ttk.Entry(notes_entry_frame, textvariable=self.notes_var).pack(
            side="left", fill="x", expand=True, padx=(0, 5)
        )
        ttk.Button(notes_entry_frame, text="폴더 선택", command=self._browse_notes).pack(
            side="right"
        )

        # 사람인 URL
        ttk.Label(ext_frame, text="사람인 URL:").grid(row=3, column=0, sticky="w", pady=3)
        self.saramin_var = tk.StringVar(value=self.saved.get("saramin_url", ""))
        ttk.Entry(ext_frame, textvariable=self.saramin_var, width=45).grid(
            row=3, column=1, sticky="ew", padx=(10, 5), pady=3
        )
        ttk.Label(
            ext_frame, text="비워도 자동 검색 (실패 시 URL 지정)", foreground="gray"
        ).grid(row=3, column=2, sticky="w", padx=5)

        ext_frame.columnconfigure(1, weight=1)

        # ── 저장 경로 ──
        path_frame = ttk.LabelFrame(self.root, text=" 저장 경로 ", padding=10)
        path_frame.pack(fill="x", padx=15, pady=5)

        default_save = self.saved.get(
            "save_dir",
            os.path.join(os.path.expanduser("~"), "Desktop"),
        )
        self.save_dir_var = tk.StringVar(value=default_save)
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
            btn_frame, text="  분석 시작  ", command=self._start_analysis
        )
        self.run_btn.pack(side="left")
        self.stop_btn = ttk.Button(
            btn_frame, text="중지", command=self._stop, state="disabled"
        )
        self.stop_btn.pack(side="left", padx=10)
        self.progress = ttk.Progressbar(btn_frame, mode="indeterminate", length=200)
        self.progress.pack(side="right")

        # ── 로그 영역 ──
        log_frame = ttk.LabelFrame(self.root, text=" 진행 상황 ", padding=5)
        log_frame.pack(fill="both", expand=True, padx=15, pady=(5, 15))

        self.log_text = scrolledtext.ScrolledText(
            log_frame, height=18, font=("Consolas", 9), state="disabled", wrap="word"
        )
        self.log_text.pack(fill="both", expand=True)

        self.root.bind("<Return>", lambda e: self._start_analysis())

    def _browse_folder(self):
        folder = filedialog.askdirectory(
            title="엑셀 저장 폴더", initialdir=self.save_dir_var.get()
        )
        if folder:
            self.save_dir_var.set(folder)

    def _browse_notes(self):
        folder = filedialog.askdirectory(
            title="공부 노트 폴더 선택", initialdir=self.notes_var.get() or "."
        )
        if folder:
            self.notes_var.set(folder)

    def _log(self, msg):
        def _append():
            self.log_text.config(state="normal")
            self.log_text.insert("end", msg + "\n")
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        self.root.after(0, _append)

    def _start_analysis(self):
        company = self.company_var.get().strip()
        period = self.period_var.get().strip()
        api_key = self.apikey_var.get().strip()

        if not company:
            messagebox.showwarning("입력 오류", "기업명을 입력해주세요.")
            return
        if not period:
            messagebox.showwarning("입력 오류", "기간을 입력해주세요.")
            return
        if not api_key:
            messagebox.showwarning(
                "API 키 필요",
                "DART API 키가 필요합니다.\n\n"
                "1. https://opendart.fss.or.kr 접속\n"
                "2. 회원가입·인증키 발급\n"
                "3. 발급받은 40자리 키를 입력",
            )
            return

        try:
            parse_period(period)
        except ValueError as e:
            messagebox.showwarning("기간 오류", str(e))
            return

        # 마지막 입력 저장
        save_config({
            "company": company, "period": period, "api_key": api_key,
            "fs": self.fs_var.get(),
            "quarterly": "1" if self.quarterly_var.get() else "0",
            "competitors": self.comp_var.get().strip(),
            "news": "1" if self.news_var.get() else "0",
            "notes": self.notes_var.get().strip(),
            "saramin_url": self.saramin_var.get().strip(),
            "save_dir": self.save_dir_var.get(),
        })

        self.running = True
        self.run_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.progress.start(10)

        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

        threading.Thread(target=self._run_analysis, daemon=True).start()

    def _stop(self):
        self.running = False
        self._log("\n[중지] 분석 중단 요청 (진행 중인 API 호출 완료 후 종료됩니다)")

    def _finish(self):
        def _restore():
            self.running = False
            self.run_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
            self.progress.stop()
        self.root.after(0, _restore)

    def _run_analysis(self):
        try:
            company = self.company_var.get().strip()
            period = self.period_var.get().strip()
            api_key = self.apikey_var.get().strip()
            fs_div = "CFS" if self.fs_var.get() == "연결" else "OFS"
            include_quarterly = self.quarterly_var.get()
            comp_text = self.comp_var.get().strip()
            competitors = [c.strip() for c in comp_text.split(",") if c.strip()] if comp_text else None
            include_news = self.news_var.get()
            notes_dir = self.notes_var.get().strip()
            saramin_url = self.saramin_var.get().strip()
            save_dir = self.save_dir_var.get()

            self._log("=" * 60)
            self._log(f"  {company} 종합 투자분석 시작")
            self._log("=" * 60)

            # stdout을 GUI 로그로 리다이렉트
            import io
            import contextlib

            class GuiWriter(io.TextIOBase):
                def __init__(self, log_fn):
                    self.log_fn = log_fn
                    self.buf = ""
                def write(self, s):
                    self.buf += s
                    while "\n" in self.buf:
                        line, self.buf = self.buf.split("\n", 1)
                        self.log_fn(line)
                    return len(s)
                def flush(self):
                    if self.buf:
                        self.log_fn(self.buf)
                        self.buf = ""

            writer = GuiWriter(self._log)
            with contextlib.redirect_stdout(writer):
                filepath = run_full_analysis(
                    company_name=company,
                    period=period,
                    api_key=api_key,
                    fs_div=fs_div,
                    competitors=competitors,
                    include_news=include_news,
                    notes_dir=notes_dir,
                    saramin_url=saramin_url,
                    include_quarterly=include_quarterly,
                    output_dir=save_dir,
                )
            writer.flush()

            if filepath and os.path.exists(filepath):
                self.root.after(0, lambda: messagebox.showinfo(
                    "분석 완료",
                    f"엑셀 파일이 생성되었습니다.\n\n"
                    f"기업: {company}\n"
                    f"파일: {filepath}\n\n"
                    f"파일이 있는 폴더를 열까요?",
                ))
                # 폴더 열기
                try:
                    if sys.platform == "win32":
                        os.startfile(os.path.dirname(filepath))
                    elif sys.platform == "darwin":
                        os.system(f'open "{os.path.dirname(filepath)}"')
                    else:
                        os.system(f'xdg-open "{os.path.dirname(filepath)}" 2>/dev/null')
                except Exception:
                    pass

        except Exception as e:
            import traceback
            self._log(f"\n[오류] {type(e).__name__}: {e}")
            self._log(traceback.format_exc())
            self.root.after(0, lambda: messagebox.showerror("오류 발생", str(e)))

        finally:
            self._finish()


def main():
    root = tk.Tk()

    style = ttk.Style()
    for theme in ("vista", "clam", "default"):
        try:
            style.theme_use(theme)
            break
        except Exception:
            continue

    app = DartAnalyzerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
