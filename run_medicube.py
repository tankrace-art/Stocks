"""
Medicube 트렌드 트래커 - GUI 버전
더블클릭으로 실행 가능한 일일 트렌드 수집 프로그램

수집 항목:
  - Google Trends (전세계 + 국가별)
  - TikTok #medicube 트렌드 (exolyt.com)
  - Amazon 뷰티 Top 100 국가별 브랜드 집계
  - Qoo10 Japan 베스트셀러
  - Olive Young Global 베스트셀러
"""
import os
import sys
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from medicube_tracker.config import OUTPUT_DIR


class MedicubeTrackerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Medicube 트렌드 트래커 - APR")
        self.root.geometry("900x700")
        self.root.configure(bg="#1F3864")
        self.root.resizable(True, True)

        self._running = False
        self._results = {}

        self._build_ui()

    # ─── UI Building ─────────────────────────────────────────────────────────

    def _build_ui(self):
        # Top banner
        banner = tk.Frame(self.root, bg="#1F3864", pady=10)
        banner.pack(fill="x")
        tk.Label(
            banner, text="🌟 Medicube 일일 트렌드 트래커",
            font=("맑은 고딕", 18, "bold"), fg="white", bg="#1F3864"
        ).pack()
        tk.Label(
            banner, text="APR 브랜드 | Google Trends · TikTok · Amazon · Qoo10 · Olive Young",
            font=("맑은 고딕", 10), fg="#AEC6E8", bg="#1F3864"
        ).pack()

        # Date display
        self._date_var = tk.StringVar(value=datetime.now().strftime("%Y년 %m월 %d일 (%A)"))
        tk.Label(
            banner, textvariable=self._date_var,
            font=("맑은 고딕", 10), fg="#7FC3FF", bg="#1F3864"
        ).pack()

        # Source selection frame
        sources_frame = tk.LabelFrame(
            self.root, text="  수집 항목 선택  ",
            font=("맑은 고딕", 10, "bold"),
            fg="white", bg="#2A4A7F",
            labelanchor="nw", pady=8, padx=10
        )
        sources_frame.pack(fill="x", padx=15, pady=(8, 4))

        self._sources = {
            "google": tk.BooleanVar(value=True),
            "amazon": tk.BooleanVar(value=True),
            "qoo10": tk.BooleanVar(value=True),
            "oliveyoung": tk.BooleanVar(value=True),
        }
        source_labels = {
            "google": "📈 Google Trends",
            "amazon": "🛒 Amazon 국가별",
            "qoo10": "🛍️ Qoo10 Japan",
            "oliveyoung": "🌿 Olive Young Global",
        }
        cols = tk.Frame(sources_frame, bg="#2A4A7F")
        cols.pack(fill="x")
        for i, (key, label) in enumerate(source_labels.items()):
            cb = tk.Checkbutton(
                cols, text=label, variable=self._sources[key],
                font=("맑은 고딕", 10), fg="white", bg="#2A4A7F",
                selectcolor="#1F3864", activebackground="#2A4A7F",
                activeforeground="white", cursor="hand2"
            )
            cb.grid(row=0, column=i, padx=12, pady=4, sticky="w")

        # Progress bar
        prog_frame = tk.Frame(self.root, bg="#1F3864")
        prog_frame.pack(fill="x", padx=15, pady=4)
        self._progress_var = tk.DoubleVar(value=0)
        self._status_var = tk.StringVar(value="대기 중...")
        tk.Label(
            prog_frame, textvariable=self._status_var,
            font=("맑은 고딕", 9), fg="#AEC6E8", bg="#1F3864"
        ).pack(anchor="w")
        self._progress_bar = ttk.Progressbar(
            prog_frame, variable=self._progress_var,
            maximum=100, length=860, mode="determinate"
        )
        self._progress_bar.pack(fill="x")

        # Buttons
        btn_frame = tk.Frame(self.root, bg="#1F3864", pady=8)
        btn_frame.pack(fill="x", padx=15)

        self._run_btn = tk.Button(
            btn_frame, text="▶  오늘 트렌드 수집 시작",
            font=("맑은 고딕", 12, "bold"),
            bg="#2E86C1", fg="white", activebackground="#1A6EA8",
            activeforeground="white", cursor="hand2",
            padx=20, pady=8, relief="flat", bd=0,
            command=self._start_collection
        )
        self._run_btn.pack(side="left", padx=(0, 8))

        self._stop_btn = tk.Button(
            btn_frame, text="■  중지",
            font=("맑은 고딕", 11),
            bg="#C0392B", fg="white", activebackground="#922B21",
            activeforeground="white", cursor="hand2",
            padx=15, pady=8, relief="flat", bd=0,
            command=self._stop_collection,
            state="disabled"
        )
        self._stop_btn.pack(side="left", padx=(0, 8))

        self._open_btn = tk.Button(
            btn_frame, text="📂  결과 폴더 열기",
            font=("맑은 고딕", 11),
            bg="#117A65", fg="white", activebackground="#0E6655",
            activeforeground="white", cursor="hand2",
            padx=15, pady=8, relief="flat", bd=0,
            command=self._open_output_folder
        )
        self._open_btn.pack(side="left", padx=(0, 8))

        self._open_file_btn = tk.Button(
            btn_frame, text="📊  엑셀 파일 열기",
            font=("맑은 고딕", 11),
            bg="#7D3C98", fg="white", activebackground="#6C3483",
            activeforeground="white", cursor="hand2",
            padx=15, pady=8, relief="flat", bd=0,
            command=self._open_last_file,
            state="disabled"
        )
        self._open_file_btn.pack(side="left")

        # Results mini-dashboard
        dash_frame = tk.LabelFrame(
            self.root, text="  실시간 결과  ",
            font=("맑은 고딕", 10, "bold"),
            fg="white", bg="#1F2D40",
            labelanchor="nw", pady=5, padx=10
        )
        dash_frame.pack(fill="x", padx=15, pady=(0, 4))

        self._result_labels = {}
        dash_cols = tk.Frame(dash_frame, bg="#1F2D40")
        dash_cols.pack(fill="x")

        result_items = [
            ("google", "Google Trends", "—"),
            ("amazon", "Amazon Medicube", "—"),
            ("qoo10_medicube", "Qoo10 Medicube", "—"),
            ("qoo10_anua", "Qoo10 Anua", "—"),
            ("oy_medicube", "OliveYoung Medicube", "—"),
            ("oy_anua", "OliveYoung Anua", "—"),
        ]
        for i, (key, label, default) in enumerate(result_items):
            card = tk.Frame(dash_cols, bg="#263850", relief="flat", bd=1)
            card.grid(row=0, column=i, padx=6, pady=4, sticky="nsew")
            dash_cols.columnconfigure(i, weight=1)
            tk.Label(
                card, text=label, font=("맑은 고딕", 8),
                fg="#7FC3FF", bg="#263850"
            ).pack(pady=(4, 0))
            val_lbl = tk.Label(
                card, text=default, font=("맑은 고딕", 12, "bold"),
                fg="white", bg="#263850"
            )
            val_lbl.pack(pady=(0, 4))
            self._result_labels[key] = val_lbl

        # Log area
        log_frame = tk.LabelFrame(
            self.root, text="  로그  ",
            font=("맑은 고딕", 10, "bold"),
            fg="white", bg="#0D1B2A",
            labelanchor="nw"
        )
        log_frame.pack(fill="both", expand=True, padx=15, pady=(0, 10))

        self._log_text = scrolledtext.ScrolledText(
            log_frame,
            font=("Consolas", 9), bg="#0D1B2A", fg="#00FF88",
            insertbackground="white", state="disabled",
            wrap="word", height=12
        )
        self._log_text.pack(fill="both", expand=True, padx=5, pady=5)
        self._log_text.tag_configure("error", foreground="#FF4444")
        self._log_text.tag_configure("success", foreground="#00FF88")
        self._log_text.tag_configure("info", foreground="#7FC3FF")
        self._log_text.tag_configure("warn", foreground="#FFD700")

        self._last_file = None
        self._log("[시스템] Medicube 트렌드 트래커 시작됨", "info")
        self._log(f"[시스템] 결과 저장 폴더: {OUTPUT_DIR}", "info")

    # ─── Logging ─────────────────────────────────────────────────────────────

    def _log(self, message: str, tag: str = None):
        self._log_text.configure(state="normal")
        timestamp = datetime.now().strftime("%H:%M:%S")
        line = f"[{timestamp}] {message}\n"
        if tag:
            self._log_text.insert("end", line, tag)
        else:
            self._log_text.insert("end", line)
        self._log_text.see("end")
        self._log_text.configure(state="disabled")

    def _log_callback(self, msg: str):
        """Thread-safe log callback for scrapers."""
        tag = None
        low = msg.lower()
        if "오류" in low or "error" in low or "실패" in low:
            tag = "error"
        elif "완료" in low or "성공" in low or "발견" in low:
            tag = "success"
        elif "수집 중" in low or "로딩" in low or "조회" in low:
            tag = "info"
        self.root.after(0, lambda m=msg, t=tag: self._log(m, t))

    def _update_status(self, msg: str, progress: float = None):
        self.root.after(0, lambda: self._status_var.set(msg))
        if progress is not None:
            self.root.after(0, lambda p=progress: self._progress_var.set(p))

    def _update_result_label(self, key: str, value: str):
        self.root.after(0, lambda k=key, v=value: self._result_labels[k].config(text=v))

    # ─── Collection Logic ────────────────────────────────────────────────────

    def _start_collection(self):
        if self._running:
            return
        selected = [k for k, v in self._sources.items() if v.get()]
        if not selected:
            messagebox.showwarning("경고", "수집할 항목을 최소 1개 이상 선택하세요.")
            return

        self._running = True
        self._results = {}
        self._run_btn.config(state="disabled")
        self._stop_btn.config(state="normal")
        self._open_file_btn.config(state="disabled")
        self._progress_var.set(0)
        for key in self._result_labels:
            self._result_labels[key].config(text="수집 중...")

        thread = threading.Thread(target=self._run_collection, args=(selected,), daemon=True)
        thread.start()

    def _stop_collection(self):
        self._running = False
        self._log("[시스템] 수집 중지 요청...", "warn")
        self._update_status("중지 중...")

    def _run_collection(self, selected: list):
        total_steps = len(selected) + 1  # +1 for export
        step = 0

        try:
            # ── Google Trends ──────────────────────────────────────────────
            if "google" in selected and self._running:
                self._update_status("Google Trends 수집 중...", (step / total_steps) * 90)
                self._log_callback("[Google Trends] 데이터 수집 시작...")
                try:
                    from medicube_tracker.google_trends import fetch_google_trends, fetch_google_trends_multi_geo
                    # Combined: global score + per-region
                    trends = fetch_google_trends(log_callback=self._log_callback)
                    if "error" not in trends:
                        regional = fetch_google_trends_multi_geo(log_callback=self._log_callback)
                        if "by_region" in regional:
                            trends["by_region"] = regional["by_region"]
                    self._results["google_trends"] = trends
                    score = trends.get("current_score", "N/A")
                    self._update_result_label("google", f"{score}/100")
                    self._log_callback(f"[Google Trends] 완료 - 점수: {score}")
                except Exception as e:
                    self._log_callback(f"[Google Trends] 오류: {e}")
                    self._results["google_trends"] = {"error": str(e)}
                    self._update_result_label("google", "오류")
                step += 1

            # ── Amazon ────────────────────────────────────────────────────
            if "amazon" in selected and self._running:
                self._update_status("Amazon 베스트셀러 수집 중...", (step / total_steps) * 90)
                try:
                    from medicube_tracker.amazon_tracker import fetch_amazon_rankings
                    amazon = fetch_amazon_rankings(log_callback=self._log_callback)
                    self._results["amazon"] = amazon
                    total = amazon.get("summary", {}).get("medicube", {}).get("총합계", 0)
                    self._update_result_label("amazon", f"{total}개 / Top100")
                except Exception as e:
                    self._log_callback(f"[Amazon] 오류: {e}")
                    self._results["amazon"] = {"error": str(e)}
                    self._update_result_label("amazon", "오류")
                step += 1

            # ── Qoo10 ────────────────────────────────────────────────────
            if "qoo10" in selected and self._running:
                self._update_status("Qoo10 Japan 수집 중...", (step / total_steps) * 90)
                try:
                    from medicube_tracker.qoo10_tracker import fetch_qoo10_rankings
                    qoo10 = fetch_qoo10_rankings(log_callback=self._log_callback)
                    self._results["qoo10"] = qoo10
                    med_cnt = qoo10.get("medicube_count", 0)
                    anua_cnt = qoo10.get("anua_count", 0)
                    self._update_result_label("qoo10_medicube", f"{med_cnt}개 발견")
                    self._update_result_label("qoo10_anua", f"{anua_cnt}개 발견")
                except Exception as e:
                    self._log_callback(f"[Qoo10] 오류: {e}")
                    self._results["qoo10"] = {"error": str(e)}
                    self._update_result_label("qoo10_medicube", "오류")
                    self._update_result_label("qoo10_anua", "오류")
                step += 1

            # ── Olive Young ──────────────────────────────────────────────
            if "oliveyoung" in selected and self._running:
                self._update_status("Olive Young 수집 중...", (step / total_steps) * 90)
                try:
                    from medicube_tracker.oliveyoung_tracker import fetch_oliveyoung_rankings
                    oy = fetch_oliveyoung_rankings(log_callback=self._log_callback)
                    self._results["oliveyoung"] = oy
                    med_cnt = oy.get("medicube_count", 0)
                    anua_cnt = oy.get("anua_count", 0)
                    self._update_result_label("oy_medicube", f"{med_cnt}개 발견")
                    self._update_result_label("oy_anua", f"{anua_cnt}개 발견")
                except Exception as e:
                    self._log_callback(f"[OliveYoung] 오류: {e}")
                    self._results["oliveyoung"] = {"error": str(e)}
                    self._update_result_label("oy_medicube", "오류")
                    self._update_result_label("oy_anua", "오류")
                step += 1

            # ── Export ────────────────────────────────────────────────────
            if self._results and self._running:
                self._update_status("엑셀 리포트 생성 중...", 95)
                self._log_callback("[엑셀] 일일 리포트 생성 중...")
                try:
                    from medicube_tracker.excel_exporter import export_daily_report
                    file_path = export_daily_report(self._results)
                    self._last_file = file_path
                    self._log_callback(f"[엑셀] 저장 완료: {file_path}")
                    self.root.after(0, lambda: self._open_file_btn.config(state="normal"))
                    self._update_status(f"완료! 파일 저장됨: {os.path.basename(file_path)}", 100)
                    self.root.after(0, lambda: messagebox.showinfo(
                        "수집 완료",
                        f"Medicube 트렌드 리포트가 저장되었습니다!\n\n{file_path}"
                    ))
                except Exception as e:
                    self._log_callback(f"[엑셀] 저장 오류: {e}")

        except Exception as e:
            self._log_callback(f"[시스템] 예기치 않은 오류: {e}")
        finally:
            self._running = False
            self.root.after(0, lambda: self._run_btn.config(state="normal"))
            self.root.after(0, lambda: self._stop_btn.config(state="disabled"))
            if self._progress_var.get() < 100:
                self._update_status("중지됨")

    # ─── Button Handlers ─────────────────────────────────────────────────────

    def _open_output_folder(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(OUTPUT_DIR)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", OUTPUT_DIR])
        else:
            subprocess.Popen(["xdg-open", OUTPUT_DIR])

    def _open_last_file(self):
        if self._last_file and os.path.exists(self._last_file):
            if sys.platform == "win32":
                os.startfile(self._last_file)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", self._last_file])
            else:
                subprocess.Popen(["xdg-open", self._last_file])
        else:
            messagebox.showinfo("안내", "아직 생성된 파일이 없습니다. 먼저 수집을 실행하세요.")


def main():
    root = tk.Tk()
    app = MedicubeTrackerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
