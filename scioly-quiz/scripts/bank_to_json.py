#!/usr/bin/env python3
"""Convert a question bank written in the plain-text authoring format into the JSON the importer loads.

Usage:  python3 scripts/bank_to_json.py <folder of .txt files> <output.json> [--config <set.json>]

Authoring format (one file per part, files read in name order):

    # R | Part 1 – Respiratory System          part code | part title
    ## A. Multiple Choice                         section (the letter before the dot is the code)
    @ A note shown before the next question
    ? [1] Question stem                          [points] or [points | TB] for a tiebreaker
    - option a                                    options make it multiple choice
    - option b
    | Col 1 | Col 2 |                             table rows (first row is the header)
    > Extra paragraph shown after the table
    = d — explanation                             answer line(s); text after " — " is the explanation

Question types are detected automatically:
    options + single letter answer     -> mc        options + "a, c" answer   -> multi
    "Select ALL ... a) x b) y" inline   -> multi     section "B." + True/False -> tf
    table + "1-b, 2-a" answer          -> match     anything else             -> free (self-marked)
"""
import json
import re
import sys
from pathlib import Path

DEFAULT_CONFIG = {
    "subject": {"slug": "anatomy-physiology", "name": "Anatomy & Physiology"},
    "set": {
        "slug": "ap-div-b-2026",
        "title": "A&P Division B · Respiratory, Digestive, Immune",
        "description": "Science Olympiad Anatomy & Physiology Division B practice bank for 2026–27, built from 31 invitational and regional exams.",
    },
    "topics": {
        "R": [
            ("Anatomy and functions of the respiratory system", r"pharynx|larynx|trachea|bronch|alveol|pleura|lobe|nasal|epiglott|carina|surfactant|conchae|function"),
            ("Mechanisms and measures of pulmonary ventilation", r"diaphragm|intercostal|boyle|pressure|compliance|ventilation|resistance|inhal|exhal|inspir|expir"),
            ("Patterns of breathing", r"eupnea|apnea|pnea\b|kussmaul|cheyne|biot|apneustic|orthopnea|dyspnea|hyperventil|hypoventil|tachypnea|bradypnea|breathing pattern"),
            ("Reading a spirogram", r"spiro|tidal|vital capacity|residual|reserve volume|capacity|fev|fvc|flow-volume"),
            ("Gas exchange, O2 transport and dissociation curves", r"hemoglobin|dissociation|bohr|haldane|partial pressure|po2|pco2|bicarbonate|carbonic|diffus|curve|p50|myoglobin"),
            ("Effects of exercise and high altitude", r"exercise|altitude|everest|athlete|training|erythropoietin|epo\b"),
            ("Diseases: COPD, asthma, emphysema, pneumonia, sleep apnea, cystic fibrosis", r"copd|asthma|emphysema|pneumonia|sleep apnea|cystic fibrosis|bronchitis|cftr"),
        ],
        "D": [
            ("Anatomy and functions of the digestive system", r"function|ingestion|accessory|quadrant|peritone|omentum|mesentery"),
            ("Alimentary canal and accessory organs", r"esophag|stomach|duoden|jejun|ileum|colon|cecum|liver|gallbladder|pancrea|salivary|teeth|tooth|tongue|appendix"),
            ("Four layers of the alimentary canal wall", r"mucosa|submucosa|muscularis|serosa|adventitia|plexus|lamina propria"),
            ("Lining of esophagus, stomach, small and large intestine", r"epitheli|lining|villi|microvilli|crypt|goblet|rugae|gastric pits|plicae"),
            ("Mechanical vs chemical digestion", r"mechanical|chemical|churn|chew|mastication|segmentation|peristalsis|emulsif"),
            ("Chemical digestion of proteins, fats and carbohydrates", r"pepsin|trypsin|chymotrypsin|lipase|amylase|maltase|sucrase|lactase|peptid|micelle|chylomicron|sglt|glut"),
            ("Effects of exercise and obesity", r"exercise|obes|runner|bmi|bariatric|fatty liver"),
            ("Diseases: ulcers, cancers, diarrhea, lactose intolerance, hepatitis, appendicitis", r"ulcer|cancer|carcinoma|diarrhea|lactose intoler|lactase|hepatitis|appendic"),
        ],
        "I": [
            ("Immune organs: bone marrow, thymus, spleen, lymph nodes, skin", r"bone marrow|thymus|thymic|spleen|splen|lymph node|skin|langerhans|lymphoid|peyer|tonsil"),
            ("Innate immunity: barriers, complement, TLRs, inflammation, innate cells", r"barrier|complement|toll|tlr|pamp|inflammat|neutrophil|macrophage|nk cell|mast cell|lysozyme|interferon|phagocyt|fever"),
            ("Adaptive immunity", r"b cell|t cell|antibod|ig[agdem]\b|mhc|helper|cytotoxic|plasma cell|memory|clonal|antigen-presenting|cd4|cd8"),
            ("Immune response and allergic reactions", r"allerg|primary response|secondary response|immune response|ige|histamine|sensitiz|vaccin"),
            ("Immunodeficiencies: HIV/AIDS, CVID, SCID", r"hiv|aids|cvid|common variable|scid|immunodeficien|digeorge|agammaglobulin"),
            ("Autoimmune: MS, RA, Hashimoto's, Graves'", r"multiple sclerosis|rheumatoid|hashimoto|graves|autoimmun|myasthenia|lupus"),
            ("Hypersensitivity types I–IV and related disorders", r"hypersensitiv|anaphyla|urticaria|hives|myasthenia|arthus|serum sickness|contact dermatitis|type i|type iv|patch test"),
        ],
    },
}

SECTION_TITLES = {"A": "Multiple choice", "B": "True or false", "C": "Fill in the blank", "D": "Matching", "E": "Data and calculations", "F": "Short answer"}
LETTERS = r"[a-h]"
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}


def parse(path: Path):
    part, sections, sec, q, pending = None, [], None, None, None
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("# "):
            code, title = [s.strip() for s in line[2:].split("|", 1)]
            part = {"code": code, "title": title, "sections": sections}
        elif line.startswith("## "):
            sec = {"title": line[3:].strip(), "note": None, "items": []}
            sections.append(sec)
            q = None
        elif line.startswith("@ "):
            if sec["items"]:
                pending = line[2:].strip()
            else:
                sec["note"] = line[2:].strip()
        elif line.startswith("? "):
            m = re.match(r"\?\s*\[([^\]]+)\]\s*(.*)", line)
            if not m:
                raise SystemExit(f"{path}:{n}: question line needs [points]")
            meta = [p.strip() for p in m.group(1).split("|")]
            q = {"pts": float(meta[0]), "tb": len(meta) > 1 and meta[1].upper() == "TB", "stem": m.group(2),
                 "opts": [], "table": [], "after": [], "ans": [], "pre": pending}
            pending = None
            sec["items"].append(q)
        elif line.startswith("- ") and q is not None and not q["ans"]:
            q["opts"].append(line[2:].strip())
        elif line.lstrip().startswith("|"):
            q["table"].append([c.strip() for c in line.strip().strip("|").split("|")])
        elif line.startswith("> "):
            q["after"].append(line[2:].strip())
        elif line.startswith("= "):
            q["ans"].append(line[2:].strip())
        else:
            raise SystemExit(f"{path}:{n}: can't read this line: {line!r}")
    if part is None:
        raise SystemExit(f"{path}: missing '# CODE | Part title' header")
    return part


def classify(q, sec_code):
    ans = " ".join(q["ans"])
    short, note = (ans.split(" — ", 1) + [""])[:2] if " — " in ans else (ans, "")
    letters_only = re.fullmatch(rf"\s*{LETTERS}(\s*,\s*{LETTERS})*\s*", short)
    out = {"stem": q["stem"], "options": None, "match_left": None, "match_choices": None, "key": [],
           "answer": ans, "explanation": note.strip(), "qtype": "free"}
    if q["opts"] and letters_only:
        key = re.findall(LETTERS, short)
        out.update(qtype="multi" if len(key) > 1 else "mc", options=q["opts"], key=key, answer=short.strip())
    elif "Select ALL" in q["stem"] and letters_only and re.search(rf"\s{LETTERS}\)\s", q["stem"]):
        m = re.search(rf"\s{LETTERS}\)\s", q["stem"])
        opts = re.split(rf"\s+{LETTERS}\)\s+", " " + q["stem"][m.start():])[1:]
        out.update(qtype="multi", stem=q["stem"][: m.start()].strip(), options=[o.strip() for o in opts],
                   key=re.findall(LETTERS, short), answer=short.strip())
    elif sec_code == "B" and re.match(r"(True|False)\b", ans):
        out.update(qtype="tf", key=[ans.split()[0].rstrip(".")], answer=ans.split()[0].rstrip("."))
    elif q["table"] and not q["after"] and re.fullmatch(r"\s*\d+-[A-Za-z]+(\s*,\s*\d+-[A-Za-z]+)*\s*", short):
        pairs = re.findall(r"(\d+)-([A-Za-z]+)", short)
        rows = q["table"][1:]
        right = [r[1] for r in rows if len(r) > 1 and r[1]]
        if right and all(re.match(r"[a-z]\.\s", c) for c in right):
            choices = [[c[0], c[3:]] for c in right]
        else:
            vals = sorted({v for _, v in pairs}, key=lambda v: (ROMAN.get(v, 99), len(v), v))
            choices = [[v, ""] for v in vals]
        if len(pairs) == len(rows):
            out.update(qtype="match", match_left=[r[0] for r in rows], match_choices=choices,
                       key=[v for _, v in pairs], answer=short.strip())
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    src, dest = Path(sys.argv[1]), Path(sys.argv[2])
    cfg = DEFAULT_CONFIG
    if "--config" in sys.argv:
        cfg = json.loads(Path(sys.argv[sys.argv.index("--config") + 1]).read_text())
    parts = [parse(p) for p in sorted(src.glob("*.txt"))]

    topics, topic_rx = [], []
    for p in parts:
        for i, (title, rx) in enumerate(cfg.get("topics", {}).get(p["code"], []), 1):
            code = f"{p['code']}{i}"
            topics.append({"code": code, "part": p["code"], "title": title})
            topic_rx.append((p["code"], code, re.compile(rx, re.I)))

    questions, section_codes, pos = [], {}, 0
    for p in parts:
        n = 0
        for s in p["sections"]:
            sec_code = s["title"][0]
            section_codes.setdefault(sec_code, SECTION_TITLES.get(sec_code, s["title"][3:].strip()))
            for q in s["items"]:
                n += 1
                pos += 1
                c = classify(q, sec_code)
                text = " ".join([q["stem"]] + q["opts"] + q["ans"] + [" ".join(r) for r in q["table"]] + q["after"])
                tags = [code for part_code, code, rx in topic_rx if part_code == p["code"] and rx.search(text)]
                questions.append({
                    "code": f"{p['code']}{n}", "position": pos, "part": p["code"], "section": sec_code,
                    "qtype": c["qtype"], "points": q["pts"], "tiebreaker": q["tb"], "pre": q["pre"],
                    "stem": c["stem"], "after_text": q["after"],
                    "table_data": q["table"] if (q["table"] and c["qtype"] != "match") else None,
                    "options": c["options"], "match_left": c["match_left"], "match_choices": c["match_choices"],
                    "tags": tags,
                    "key": c["key"], "answer_text": c["answer"], "explanation": c["explanation"],
                })

    data = {
        "subject": cfg["subject"],
        "set": {**cfg["set"],
                "parts": [{"code": p["code"], "title": p["title"]} for p in parts],
                "sections": [{"code": k, "title": v} for k, v in sorted(section_codes.items())],
                "topics": topics},
        "questions": questions,
    }
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {}
    for q in questions:
        counts[q["qtype"]] = counts.get(q["qtype"], 0) + 1
    print(f"Wrote {len(questions)} questions to {dest}: {counts}")


if __name__ == "__main__":
    main()
