import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, RotateCcw, Mail, FileDown, Plus, X, KeyRound } from "lucide-react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "refine-template-v1";
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockItem {
  text: string;
  image: string;
  score?: string;
}

interface PageData {
  left: BlockItem[];
  right: BlockItem[];
}

interface AnswerKeyData {
  enabled: boolean;
  options: 4 | 5;
  count: number;
}

interface TemplateData {
  headerTitle: string;
  headerSchool: string;
  page1: PageData;
  page2: PageData;
  answerKey: AnswerKeyData;
}

// ─── Default Data ─────────────────────────────────────────────────────────────

const defaultAnswerKey: AnswerKeyData = {
  enabled: false,
  options: 4,
  count: 15,
};

const defaultData: TemplateData = {
  headerTitle: "X. Sınıf Matematik Dersi 2.Dönem 1. Yazılı Sınavı",
  headerSchool: "Mehmet Akif Ortaokulu (202X-202X)",
  page1: {
    left: [
      { text: "Soru 1", image: "", score: "Puanı: ......." },
      { text: "Soru 2", image: "", score: "Puanı: ......." },
    ],
    right: [
      { text: "Soru 3", image: "", score: "Puanı: ......." },
      { text: "Soru 4", image: "", score: "Puanı: ......." },
    ],
  },
  page2: {
    left: [
      { text: "Soru 5", image: "", score: "Puanı: ......." },
      { text: "Soru 6", image: "", score: "Puanı: ......." },
      { text: "Soru 7", image: "", score: "Puanı: ......." },
    ],
    right: [
      { text: "Soru 8", image: "", score: "Puanı: ......." },
      { text: "Soru 9", image: "", score: "Puanı: ......." },
      { text: "Soru 10", image: "", score: "Puanı: ......." },
    ],
  },
  answerKey: defaultAnswerKey,
};

/** Migrate old flat-array format to new left/right column format */
function migrateOldFormat(raw: unknown): TemplateData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Already new format
  if (r.page1 && typeof r.page1 === "object" && "left" in (r.page1 as object)) {
    const result = r as unknown as TemplateData;
    // Ensure answerKey exists (may not exist in older saves)
    if (!result.answerKey) {
      result.answerKey = defaultAnswerKey;
    }
    return result;
  }

  // Old format: page1 is array[4], page2 is array[6]
  if (Array.isArray(r.page1) && Array.isArray(r.page2)) {
    return {
      headerTitle: typeof r.headerTitle === "string" ? r.headerTitle : defaultData.headerTitle,
      headerSchool: typeof r.headerSchool === "string" ? r.headerSchool : defaultData.headerSchool,
      page1: {
        left: (r.page1 as BlockItem[]).slice(0, 2),
        right: (r.page1 as BlockItem[]).slice(2, 4),
      },
      page2: {
        left: (r.page2 as BlockItem[]).slice(0, 3),
        right: (r.page2 as BlockItem[]).slice(3, 6),
      },
      answerKey: defaultAnswerKey,
    };
  }

  return null;
}

const PAGE1_MAX_TOTAL = 8;
const PAGE2_MAX_TOTAL = 8;

// ─── EditableText ─────────────────────────────────────────────────────────────

interface EditableTextProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}

function EditableText({ value, onChange, className = "" }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative group w-full block border border-transparent hover:border-blue-400 transition-colors duration-150 rounded-none print:border-0">
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        onMouseDown={() => {
          setEditing(true);
          setTimeout(() => divRef.current?.focus(), 0);
        }}
        onClick={(e) => {
          setEditing(true);
          e.currentTarget.focus();
        }}
        onBlur={(e) => {
          setEditing(false);
          onChange(e.currentTarget.innerText);
        }}
        className={[
          "cursor-text whitespace-pre-wrap text-zinc-700 outline-none transition-all w-full block",
          editing ? "ring-2 ring-zinc-300 px-1 print:ring-0" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}>
        {value}
      </div>
      <div className="print:hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex flex-col items-center">
        <div className="bg-slate-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
          Bu bölüme tıklayarak düzenleyebilirsiniz
        </div>
        <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900" />
      </div>
    </div>
  );
}

// ─── ImageUploader ────────────────────────────────────────────────────────────

interface ImageUploaderProps {
  src: string;
  onChange: (val: string | ArrayBuffer | null) => void;
  height: number;
}

function ImageUploader({ src, onChange, height }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="relative overflow-hidden bg-zinc-50 border border-dashed border-zinc-300 flex items-center justify-center"
      style={{ height }}>
      {src && <img src={src} className="absolute inset-0 w-full h-full object-cover" alt="Yüklenen görsel" />}

      <Button
        size="sm"
        className="upload-btn print:hidden relative z-10 bg-slate-900 hover:bg-slate-800 text-white border-transparent cursor-pointer"
        onClick={() => inputRef.current?.click()}>
        Soru Yükle
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange(reader.result);
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
}

// ─── AddBlockZone ─────────────────────────────────────────────────────────────

function AddBlockZone({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="add-block-zone print:hidden" style={{ height: "44px" }}>
      <button
        onClick={onAdd}
        className="w-full h-full border-2 border-dashed border-zinc-300 hover:border-zinc-400 rounded flex items-center justify-center gap-1 bg-transparent hover:bg-zinc-50 cursor-pointer transition-colors duration-150">
        <Plus className="size-3 text-zinc-400" />
        <span className="text-xs text-zinc-400">Buraya blok ekle</span>
      </button>
    </div>
  );
}

// ─── Block Card ───────────────────────────────────────────────────────────────

const DEFAULT_IMAGE_HEIGHT = 160;

interface BlockCardProps {
  item: BlockItem;
  onTextChange: (val: string) => void;
  onImageChange: (val: string | ArrayBuffer | null) => void;
  onScoreChange: (val: string) => void;
  onRemove: () => void;
  maxImageHeight: number;
}

function BlockCard({ item, onTextChange, onImageChange, onScoreChange, onRemove, maxImageHeight }: BlockCardProps) {
  const [blockHeight, setBlockHeight] = useState<number>(DEFAULT_IMAGE_HEIGHT);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = blockHeight;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newHeight = Math.min(maxImageHeight, Math.max(DEFAULT_IMAGE_HEIGHT, startHeight + delta));
      setBlockHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
    };

    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="relative group/block bg-white border border-zinc-200 hover:border-blue-400 transition-colors duration-200 p-3 flex flex-col gap-2 print:border-zinc-200">
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="print:hidden absolute z-20 opacity-0 group-hover/block:opacity-100 transition-opacity duration-200 flex items-center gap-0.5 bg-red-50 border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-100 hover:border-red-400 rounded px-1.5 py-0.5 text-xs cursor-pointer"
        style={{ left: "-92px", top: "50%", transform: "translateY(-50%)" }}
        title="Blogu kaldır">
        <X className="size-3" />
        <span>Blogu kaldır</span>
      </button>

      <div className="flex items-center gap-2">
        <EditableText value={item.text} onChange={onTextChange} className="font-semibold text-sm text-zinc-800" />
        <div className="ml-auto shrink-0">
          <EditableText
            value={item.score ?? "Puanı: ......."}
            onChange={onScoreChange}
            className="text-xs text-zinc-600 text-right whitespace-nowrap"
          />
        </div>
      </div>
      <ImageUploader src={item.image} onChange={onImageChange} height={blockHeight} />
      {item.image && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="no-print h-2 w-full cursor-s-resize bg-zinc-100 hover:bg-zinc-300 transition-colors rounded-b print:hidden"
                onMouseDown={handleResizeStart}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>Aşağı doğru bölümü uzatabilmek için bloğun alt tarafındaki çizgiyi mouse ile aşağı çekebilirsiniz</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  blocks: BlockItem[];
  keyPrefix: string;
  showAddZone: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, key: "text" | "image" | "score", value: string | ArrayBuffer | null) => void;
  maxImageHeight: number;
  trailingContent?: React.ReactNode;
}

function Column({
  blocks,
  keyPrefix,
  showAddZone,
  onAdd,
  onRemove,
  onUpdate,
  maxImageHeight,
  trailingContent,
}: ColumnProps) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
      {blocks.map((item, i) => (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          <BlockCard
            item={item}
            onTextChange={(val) => onUpdate(i, "text", val)}
            onImageChange={(val) => onUpdate(i, "image", val)}
            onScoreChange={(val) => onUpdate(i, "score", val)}
            onRemove={() => onRemove(i)}
            maxImageHeight={maxImageHeight}
          />
        </React.Fragment>
      ))}
      {trailingContent}
      {showAddZone && <AddBlockZone onAdd={onAdd} />}
    </div>
  );
}

// ─── AnswerKey SVG ────────────────────────────────────────────────────────────

interface AnswerKeySVGProps {
  options: 4 | 5;
  count: number;
}

function AnswerKeySVG({ options, count }: AnswerKeySVGProps) {
  const optionLabels = options === 5 ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"];

  const leftCount = Math.ceil(count / 2);
  const rightCount = Math.floor(count / 2);

  // ── Layout constants ──────────────────────────────────────────────────────
  const paddingX = 5;
  const paddingY = 4;
  const headerH = 14;
  const rowH = 12;
  const circleR = 4; // diameter = 8px
  const circleGap = 2; // gap between circles
  const circleStep = circleR * 2 + circleGap; // 10px center-to-center
  const numW = 13; // width reserved for question number
  const numCircleGap = 2; // gap between number and first circle
  const colGap = 6; // gap between the two columns

  // Width of all circles in one row
  const circlesWidth = options * (circleR * 2) + (options - 1) * circleGap;
  // Single column content width
  const colW = numW + numCircleGap + circlesWidth;

  // SVG total dimensions
  const totalW = paddingX * 2 + colW * 2 + colGap;
  const totalH = headerH + paddingY + Math.ceil(count / 2) * rowH + paddingY;

  const leftOffsetX = paddingX;
  const rightOffsetX = paddingX + colW + colGap;

  const renderColumn = (startQ: number, qCount: number, offsetX: number) =>
    Array.from({ length: qCount }, (_, i) => {
      const qNum = startQ + i;
      const rowY = headerH + paddingY + i * rowH;
      const cy = rowY + circleR; // vertical center of the row
      const firstCX = offsetX + numW + numCircleGap + circleR;

      return (
        <g key={qNum}>
          {/* Question number */}
          <text
            x={offsetX + numW}
            y={cy + 2}
            textAnchor="end"
            fontSize="7"
            fontFamily="system-ui, sans-serif"
            fill="#52525b">
            {qNum}.
          </text>

          {/* Option circles */}
          {optionLabels.map((label, li) => {
            const cx = firstCX + li * circleStep;
            return (
              <g key={label}>
                <circle cx={cx} cy={cy} r={circleR} stroke="#a1a1aa" strokeWidth="1" fill="white" />
                <text
                  x={cx}
                  y={cy + 2}
                  textAnchor="middle"
                  fontSize="5"
                  fontFamily="system-ui, sans-serif"
                  fill="#71717a">
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      );
    });

  return (
    <div className="w-full">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: "block" }}>
        {/* White background */}
        <rect x="0" y="0" width={totalW} height={totalH} fill="white" />

        {/* Outer border */}
        <rect
          x="0.5"
          y="0.5"
          width={totalW - 1}
          height={totalH - 1}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth="1"
          rx="4"
        />

        {/* Header background */}
        <rect x="0" y="0" width={totalW} height={headerH} fill="#f4f4f5" rx="4" />
        {/* Square off bottom corners of header fill */}
        <rect x="0" y={headerH - 4} width={totalW} height={4} fill="#f4f4f5" />
        <line x1="0" y1={headerH} x2={totalW} y2={headerH} stroke="#e4e4e7" strokeWidth="1" />

        {/* Header label */}
        <text
          x={totalW / 2}
          y={headerH / 2 + 2}
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          fill="#27272a"
          letterSpacing="1.5">
          CEVAP ANAHTARI
        </text>

        {/* Center divider */}
        <line
          x1={paddingX + colW + colGap / 2}
          y1={headerH + paddingY}
          x2={paddingX + colW + colGap / 2}
          y2={totalH - paddingY}
          stroke="#e4e4e7"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Left column */}
        {renderColumn(1, leftCount, leftOffsetX)}

        {/* Right column */}
        {renderColumn(leftCount + 1, rightCount, rightOffsetX)}
      </svg>
    </div>
  );
}

// ─── AddAnswerKeyZone ─────────────────────────────────────────────────────────

function AddAnswerKeyZone({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="add-answer-key-zone print:hidden mt-2" style={{ height: "44px" }}>
      <button
        onClick={onAdd}
        className="w-full h-full border-2 border-dashed border-zinc-300 hover:border-zinc-400 rounded flex items-center justify-center gap-1 bg-transparent hover:bg-zinc-50 cursor-pointer transition-colors duration-150">
        <KeyRound className="size-3 text-zinc-400" />
        <span className="text-xs text-zinc-400">Cevap anahtarı ekle</span>
      </button>
    </div>
  );
}

// ─── AnswerKeyModal ───────────────────────────────────────────────────────────

interface AnswerKeyModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: 4 | 5, count: number) => void;
}

function AnswerKeyModal({ open, onClose, onConfirm }: AnswerKeyModalProps) {
  const [selectedOptions, setSelectedOptions] = useState<4 | 5>(4);
  const [count, setCount] = useState(15);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-800">Cevap Anahtarı Oluştur</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Option count */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-zinc-700">Kaç şıklı olsun?</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedOptions(4)}
                className={[
                  "flex-1 py-2 px-3 rounded border text-sm font-medium transition-colors cursor-pointer",
                  selectedOptions === 4
                    ? "bg-zinc-800 text-white border-zinc-800"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400",
                ].join(" ")}>
                A B C D
              </button>
              <button
                onClick={() => setSelectedOptions(5)}
                className={[
                  "flex-1 py-2 px-3 rounded border text-sm font-medium transition-colors cursor-pointer",
                  selectedOptions === 5
                    ? "bg-zinc-800 text-white border-zinc-800"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400",
                ].join(" ")}>
                A B C D E
              </button>
            </div>
          </div>

          {/* Question count */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="question-count" className="text-sm font-medium text-zinc-700">
              Kaç soruluk olsun?
            </Label>
            <Input
              id="question-count"
              type="number"
              min={5}
              max={15}
              value={count}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setCount(Math.min(15, Math.max(5, val)));
              }}
              className="w-full"
            />
            <p className="text-xs text-zinc-400">En az 5, en fazla 15 soru</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white">
            İptal
          </Button>
          <Button
            onClick={() => onConfirm(selectedOptions, count)}
            className="bg-slate-900 hover:bg-slate-800 text-white cursor-pointer">
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── A4Template (main) ────────────────────────────────────────────────────────

export default function A4Template() {
  const [data, setData] = useState<TemplateData>(defaultData);
  const [isMounted, setIsMounted] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [a4MaxImageHeight, setA4MaxImageHeight] = useState<number>(560);
  const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateMaxHeight = () => {
      const ref = page1Ref.current ?? page2Ref.current;
      if (ref && ref.offsetHeight > 0) {
        setA4MaxImageHeight(ref.offsetHeight / 2);
      }
    };
    calculateMaxHeight();
    window.addEventListener("resize", calculateMaxHeight);
    return () => window.removeEventListener("resize", calculateMaxHeight);
  }, []);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedAt = parsed?.savedAt;
        const rawData = parsed?.data ?? parsed;
        if (savedAt && Date.now() - savedAt < THREE_DAYS) {
          const migrated = migrateOldFormat(rawData);
          if (migrated?.page1 && migrated?.page2) {
            setData(migrated);
          } else {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error("Hafıza yükleme hatası", e);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      const payload = { data, savedAt: Date.now() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("Hafıza kaydetme hatası", e);
    }
  }, [data, isMounted]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updateColumnBlock = (
    page: "page1" | "page2",
    col: "left" | "right",
    index: number,
    key: "text" | "image" | "score",
    value: string | ArrayBuffer | null,
  ) => {
    setData((prev) => {
      const updated = { ...prev };
      updated[page] = { ...prev[page] };
      updated[page][col] = [...prev[page][col]];
      updated[page][col][index] = { ...updated[page][col][index], [key]: value };
      return updated;
    });
  };

  const removeBlock = (page: "page1" | "page2", col: "left" | "right", index: number) => {
    setData((prev) => {
      const updated = { ...prev };
      updated[page] = { ...prev[page] };
      updated[page][col] = prev[page][col].filter((_, i) => i !== index);
      return updated;
    });
  };

  const addBlock = (page: "page1" | "page2", col: "left" | "right") => {
    const pageData = data[page];
    const total = pageData.left.length + pageData.right.length;
    const max = page === "page1" ? PAGE1_MAX_TOTAL : PAGE2_MAX_TOTAL;
    if (total >= max) return;

    const nextNum =
      data.page1.left.length + data.page1.right.length + data.page2.left.length + data.page2.right.length + 1;

    const newBlock: BlockItem = {
      text: `Soru ${nextNum}`,
      image: "",
      score: "Puanı: .......",
    };

    setData((prev) => {
      const updated = { ...prev };
      updated[page] = { ...prev[page] };
      updated[page][col] = [...prev[page][col], newBlock];
      return updated;
    });
  };

  const handleAddAnswerKey = (options: 4 | 5, count: number) => {
    setData((prev) => ({ ...prev, answerKey: { enabled: true, options, count } }));
    setAnswerKeyModalOpen(false);
  };

  const handleRemoveAnswerKey = () => {
    setData((prev) => ({ ...prev, answerKey: { ...prev.answerKey, enabled: false } }));
  };

  // ── Limit checks ──────────────────────────────────────────────────────────

  const page1Total = data.page1.left.length + data.page1.right.length;
  const page2Total = data.page2.left.length + data.page2.right.length;
  const canAddPage1 = page1Total < PAGE1_MAX_TOTAL;
  const canAddPage2 = page2Total < PAGE2_MAX_TOTAL;

  // ── PDF / Print ───────────────────────────────────────────────────────────

  const savePdf = async () => {
    if (!page1Ref.current || !page2Ref.current) return;
    setIsPdfGenerating(true);
    try {
      document.body.classList.add("pdf-generating");
      const options = { pixelRatio: 2, backgroundColor: "#ffffff" };
      const img1 = await toPng(page1Ref.current, options);
      const img2 = await toPng(page2Ref.current, options);
      document.body.classList.remove("pdf-generating");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      pdf.addImage(img1, "PNG", 0, 0, 210, 297);
      pdf.addPage();
      pdf.addImage(img2, "PNG", 0, 0, 210, 297);
      pdf.save("sablonA4.pdf");
    } catch (e) {
      console.error("PDF oluşturma hatası:", e);
    } finally {
      document.body.classList.remove("pdf-generating");
      setIsPdfGenerating(false);
    }
  };

  const handlePrint = () => {
    document.body.setAttribute("data-print", "true");
    window.print();
    document.body.removeAttribute("data-print");
  };

  return (
    <div className="screen-wrapper min-h-screen bg-slate-900 font-sans flex flex-col items-center py-10 px-4">
      {/* Pages container */}
      <div className="a4-print-area flex flex-col gap-6">
        {/* ── Page 1 ── */}
        <div
          ref={page1Ref}
          className="a4-page bg-white border border-zinc-200 shadow-md"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "5mm",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}>
          {/* Title */}
          <div className="page-header border-b border-zinc-200 pb-4 mb-6 flex flex-row gap-4 items-start">
            <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/c/cc/Milli_E%C4%9Fitim_Bakanl%C4%B1%C4%9F%C4%B1_Logo.svg"
                alt="MEB Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1 flex flex-col items-start gap-1">
              <EditableText
                value={data.headerTitle}
                onChange={(val) => setData((prev) => ({ ...prev, headerTitle: val }))}
                className="text-xl font-bold text-zinc-800 leading-tight w-full"
              />
              <EditableText
                value={data.headerSchool}
                onChange={(val) => setData((prev) => ({ ...prev, headerSchool: val }))}
                className="text-xl font-semibold text-zinc-700 leading-tight w-full"
              />
              <div className="flex flex-row w-full mt-1">
                <span className="w-[50%] text-base font-semibold text-zinc-700 border-r border-zinc-300 pr-2">
                  Ad Soyad:
                </span>
                <span className="w-[30%] text-base font-semibold text-zinc-700 border-r border-zinc-300 px-2">
                  Öğrenci No:
                </span>
                <span className="w-[20%] text-base font-semibold text-zinc-700 pl-2">Sınıfı:</span>
              </div>
            </div>
          </div>

          {/* 2-column grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              flex: 1,
              alignItems: "flex-start",
            }}>
            <Column
              blocks={data.page1.left}
              keyPrefix="p1-left"
              showAddZone={canAddPage1}
              onAdd={() => addBlock("page1", "left")}
              onRemove={(i) => removeBlock("page1", "left", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page1", "left", i, key, val)}
              maxImageHeight={a4MaxImageHeight}
            />
            <Column
              blocks={data.page1.right}
              keyPrefix="p1-right"
              showAddZone={canAddPage1}
              onAdd={() => addBlock("page1", "right")}
              onRemove={(i) => removeBlock("page1", "right", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page1", "right", i, key, val)}
              maxImageHeight={a4MaxImageHeight}
            />
          </div>
        </div>

        {/* ── Page 2 ── */}
        <div
          ref={page2Ref}
          className="a4-page bg-white border border-zinc-200 shadow-md"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "5mm",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}>
          {/* 2-column grid */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              alignItems: "flex-start",
            }}>
            <Column
              blocks={data.page2.left}
              keyPrefix="p2-left"
              showAddZone={canAddPage2}
              onAdd={() => addBlock("page2", "left")}
              onRemove={(i) => removeBlock("page2", "left", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page2", "left", i, key, val)}
              maxImageHeight={a4MaxImageHeight}
            />
            <Column
              blocks={data.page2.right}
              keyPrefix="p2-right"
              showAddZone={canAddPage2}
              onAdd={() => addBlock("page2", "right")}
              onRemove={(i) => removeBlock("page2", "right", i)}
              onUpdate={(i, key, val) => updateColumnBlock("page2", "right", i, key, val)}
              maxImageHeight={a4MaxImageHeight}
              trailingContent={
                !data.answerKey.enabled ? (
                  <AddAnswerKeyZone onAdd={() => setAnswerKeyModalOpen(true)} />
                ) : (
                  <div className="relative group/answerkey mt-2 w-full" style={{ boxSizing: "border-box" }}>
                    {/* Remove button */}
                    <button
                      onClick={handleRemoveAnswerKey}
                      className="print:hidden absolute z-20 opacity-0 group-hover/answerkey:opacity-100 transition-opacity duration-200 flex items-center gap-0.5 bg-red-50 border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-100 hover:border-red-400 rounded px-1.5 py-0.5 text-xs cursor-pointer"
                      style={{ right: "4px", top: "-24px" }}
                      title="Cevap anahtarını kaldır">
                      <X className="size-3" />
                      <span>Kaldır</span>
                    </button>
                    <div className="bg-white w-full" style={{ boxSizing: "border-box" }}>
                      <AnswerKeySVG options={data.answerKey.options} count={data.answerKey.count} />
                    </div>
                  </div>
                )
              }
            />
          </div>
        </div>
      </div>

      {/* ── Answer Key Modal ── */}
      <AnswerKeyModal
        open={answerKeyModalOpen}
        onClose={() => setAnswerKeyModalOpen(false)}
        onConfirm={handleAddAnswerKey}
      />

      {/* ── Floating Action Menu ── */}
      <TooltipProvider>
        <div className="floating-action-menu fixed bottom-6 right-6 z-50 flex flex-col gap-2 bg-white/90 backdrop-blur-sm border border-zinc-200 rounded-xl shadow-lg p-3 print:hidden min-w-[220px]">
          <Button onClick={handlePrint} variant="outline" className="gap-2 w-full cursor-pointer justify-start">
            <Printer className="size-4 shrink-0 text-zinc-400" />
            Yazıcıya gönder
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={savePdf}
                disabled={isPdfGenerating}
                variant="outline"
                className="gap-2 w-full cursor-pointer justify-start">
                <FileDown className="size-4 shrink-0 text-zinc-400" />
                {isPdfGenerating ? "Hazırlanıyor..." : "PDF olarak kaydet"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs bg-slate-900 text-white border-slate-900">
              <p>
                Pdf olarak indirdiğinizde yazı karakterlerinde çok hafif bir bozulma olacaktır. Yazıcıya gönder diyerek
                çıktı almanız daha uygundur.
              </p>
            </TooltipContent>
          </Tooltip>
          <Button asChild variant="outline" className="gap-2 w-full cursor-pointer justify-start">
            <a
              href={`mailto:?subject=${encodeURIComponent("A4 Şablon")}&body=${encodeURIComponent("Merhaba, bu şablonu seninle paylaşmak istedim.")}`}>
              <Mail className="size-4 shrink-0" />
              Arkadaşına gönder
            </a>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm("Tüm değişiklikler silinecek. Emin misiniz?")) {
                    window.localStorage.removeItem(STORAGE_KEY);
                    setData(defaultData);
                  }
                }}
                className="gap-2 w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400 cursor-pointer justify-start">
                <RotateCcw className="size-4 shrink-0" />
                Değişiklikleri sıfırla
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              className="max-w-xs bg-red-600 text-white border-red-600 [&>span]:bg-red-600 [&>span]:border-red-600">
              <p>
                Tıkladığınızda yaptığınız tüm değişiklikler silinecektir. Sıfırlamadan tarayıcınızdan çıkış yaptığınızda
                sorularınız 3 gün boyunca kayıtlı kalacaktır. Umumi bir bilgisayarsa mutlaka sıfırlayınız
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
