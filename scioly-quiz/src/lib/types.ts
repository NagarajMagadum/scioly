export type QType = "mc" | "multi" | "tf" | "match" | "free";

export type Labelled = { code: string; title: string };
export type Topic = { code: string; part: string; title: string };

export type QuestionSet = {
  id: string;
  slug: string;
  title: string;
  description: string;
  parts: Labelled[];
  sections: Labelled[];
  topics: Topic[];
  subject: { name: string; slug: string } | null;
};

/** A question as the browser sees it: never includes the answer key. */
export type Question = {
  id: string;
  code: string;
  position: number;
  part: string;
  section: string;
  qtype: QType;
  points: number;
  tiebreaker: boolean;
  pre: string | null;
  stem: string;
  after_text: string[];
  table_data: string[][] | null;
  options: string[] | null;
  match_left: string[] | null;
  match_choices: [string, string][] | null;
  tags: string[];
};

export type Response =
  | { value: string }
  | { values: string[] }
  | { text: string };

export type GradeResult = {
  attempt_id: string;
  correct: boolean | null;
  key: string[];
  answer: string;
  explanation: string;
};

export type Latest = { question_id: string; correct: boolean | null; response: Response; id: string };
