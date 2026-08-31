"use client";

/**
 * 캡처 올리기 → 확인 → 저장 (지시서 4장)
 *
 * 한 화면에서 세 걸음이다. 걸음마다 한 가지만 묻는다.
 *
 *   pick     캡처를 고르거나 레시피를 붙여넣는다
 *   reading  2패스 파싱 (수십 초 걸린다 — 뭘 하는 중인지 말해준다)
 *   confirm  **확정은 접어두고 확인 필요한 것만 펼친다.**
 *            재료 16개를 다 펼치면 화면이 빽빽해서 그냥 저장을 누르게 된다.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  commit,
  ingest,
  ingestLink,
  ingestShared,
  saveLinkOnly,
  type Draft,
  type DraftItem,
  type IngestResult,
} from "./actions";
import type { Shared } from "./page";
import styles from "./add.module.css";

const MAPPED = "MAPPED";
const CHECK = "CHECK";
const UNMAPPED = "UNMAPPED";

type Fail = Extract<IngestResult, { ok: false }>;

type Phase =
  | { at: "pick"; error?: Fail }
  | { at: "reading" }
  | { at: "linking" }
  | { at: "confirm"; draft: Draft }
  | { at: "saving"; draft: Draft };

export default function Add({ shared }: { shared?: Shared | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ at: "pick" });
  const [, startTransition] = useTransition();

  function land(result: IngestResult) {
    setPhase(
      result.ok ? { at: "confirm", draft: result.draft } : { at: "pick", error: result },
    );
  }

  function onIngest(form: FormData) {
    setPhase({ at: "reading" });
    startTransition(async () => land(await ingest(form)));
  }

  function onLink(url: string) {
    setPhase({ at: "linking" });
    startTransition(async () => land(await ingestLink(url)));
  }

  function onLinkOnly(title: string, url: string) {
    startTransition(async () => {
      await saveLinkOnly(title, url);
      router.push("/?tab=want");
    });
  }

  function onShared() {
    if (!shared) return;
    setPhase({ at: "reading" });
    startTransition(async () =>
      land(await ingestShared(shared.assetIds, shared.url)),
    );
  }

  function onCommit(draft: Draft) {
    setPhase({ at: "saving", draft });
    startTransition(async () => {
      try {
        await commit(draft);
        router.push("/?tab=want");
      } catch (e) {
        setPhase({ at: "confirm", draft });
        alert(e instanceof Error ? e.message : "저장하지 못했어요");
      }
    });
  }

  if (phase.at === "linking") return <Linking />;
  if (phase.at === "reading") return <Reading />;
  if (phase.at === "confirm" || phase.at === "saving") {
    return (
      <Confirm
        draft={phase.draft}
        saving={phase.at === "saving"}
        onChange={(draft) => setPhase({ at: "confirm", draft })}
        onSave={onCommit}
        onBack={() => setPhase({ at: "pick" })}
      />
    );
  }
  return (
    <Pick
      onSubmit={onIngest}
      error={phase.error}
      shared={shared}
      onShared={onShared}
      onLink={onLink}
      onLinkOnly={onLinkOnly}
    />
  );
}

/* ---------------------------------------------------------------- */

function Pick({
  onSubmit,
  error,
  shared,
  onShared,
  onLink,
  onLinkOnly,
}: {
  onSubmit: (form: FormData) => void;
  error?: Fail;
  shared?: Shared | null;
  onShared: () => void;
  onLink: (url: string) => void;
  onLinkOnly: (title: string, url: string) => void;
}) {
  const [count, setCount] = useState(0);
  const [url, setUrl] = useState(shared?.url ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const gotShared = Boolean(shared?.assetIds.length);

  // 인스타는 링크로 본문을 못 읽는다. 넣어놓고 안 될 걸 알면서
  // 시도하게 만들지 않는다 (지시서 4장).
  const instagram = /instagram\.com/i.test(url);

  return (
    <form action={onSubmit}>
      {/* 공유 시트로 넘어온 것. 여기서 바로 이어가면 다시 고를 필요가 없다 */}
      {gotShared && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            공유받은 캡처 {shared!.assetIds.length}장이 있어요
          </h2>
          <p className={styles.body}>이걸로 바로 정리해드릴까요?</p>
          {shared!.url && <p className={styles.hint}>{shared!.url}</p>}
          <button type="button" className={styles.shared} onClick={onShared}>
            이걸로 정리해줄게요
          </button>
        </section>
      )}

      {shared?.problem && (
        <section className={styles.card}>
          <h2 className={`${styles.cardTitle} ${styles.warm}`}>
            {shared.problem}
          </h2>
          <p className={styles.body}>아래에서 직접 올려주세요.</p>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {gotShared ? "다른 캡처를 올려도 돼요" : "캡처를 올려주세요"}
        </h2>
        <p className={styles.body}>
          재료와 만드는 법이 보이면 돼요. 1~3장까지 한 번에 읽어요.
        </p>

        <input
          ref={fileRef}
          id="images"
          className={styles.file}
          type="file"
          name="images"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => setCount(e.target.files?.length ?? 0)}
        />
        <label htmlFor="images" className={styles.drop}>
          {count > 0 ? `캡처 ${count}장 골랐어요` : "캡처 고르기"}
        </label>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>글로 붙여넣어도 돼요</h2>
        <textarea
          className={styles.textarea}
          name="text"
          rows={4}
          defaultValue={shared?.text ?? ""}
          placeholder="레시피 본문을 그대로 붙여넣으세요"
        />
      </section>

      <section className={styles.card}>
        <label className={styles.label} htmlFor="sourceUrl">
          링크가 있으면 붙여넣어 주세요
        </label>
        <input
          id="sourceUrl"
          className={styles.input}
          type="url"
          name="sourceUrl"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="인스타·유튜브·블로그 주소"
        />
        <p className={styles.hint}>
          {instagram
            ? "인스타는 링크로는 못 읽어요. 캡처를 올려주세요 — 주소는 같이 보관할게요."
            : "읽을 수 있으면 읽고, 안 되면 캡처를 올려달라고 알려드려요."}
        </p>
        {url.trim() && !instagram && (
          <button
            type="button"
            className={styles.linkGo}
            onClick={() => onLink(url)}
          >
            링크 읽어볼게요
          </button>
        )}
      </section>

      {error && (
        <section className={styles.card}>
          <h2 className={`${styles.cardTitle} ${styles.warm}`}>{error.message}</h2>
          {error.hint && <p className={styles.body}>{error.hint}</p>}
          {/* 못 읽어도 제목은 건졌으면 이름만 저장하는 길을 연다 */}
          {error.linkOnly && (
            <>
              <p className={styles.hint}>
                이름만 저장해두고, 재료는 만들 때 링크에서 봐도 돼요.
              </p>
              <button
                type="button"
                className={styles.linkGo}
                onClick={() =>
                  onLinkOnly(error.linkOnly!.title, error.linkOnly!.url)
                }
              >
                &ldquo;{error.linkOnly.title}&rdquo; 이름만 저장할게요
              </button>
            </>
          )}
        </section>
      )}

      {/*
        공유로 들어왔으면 주 행동은 위쪽("이걸로 정리해줄게요")이다.
        파란 버튼이 한 화면에 둘이면 어느 쪽을 눌러야 할지 갈린다.
      */}
      <button
        type="submit"
        className={gotShared ? styles.quiet : styles.primary}
      >
        {gotShared ? "올린 걸로 정리해줄게요" : "정리해줄게요"}
      </button>
    </form>
  );
}

function Linking() {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>링크를 열어보는 중이에요</h2>
      <p className={styles.body}>
        읽어도 되는 페이지인지 먼저 확인하고, 본문이 있으면 가져와요.
      </p>
    </section>
  );
}

function Reading() {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>읽는 중이에요</h2>
      <p className={styles.body}>
        재료를 먼저 옮기고, 만드는 법에만 나오는 재료가 있는지 한 번 더 봐요.
      </p>
      <p className={styles.hint}>30초쯤 걸려요.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- */

function Confirm({
  draft,
  saving,
  onChange,
  onSave,
  onBack,
}: {
  draft: Draft;
  saving: boolean;
  onChange: (d: Draft) => void;
  onSave: (d: Draft) => void;
  onBack: () => void;
}) {
  const [openMapped, setOpenMapped] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const set = (i: number, patch: Partial<DraftItem>) =>
    onChange({
      ...draft,
      items: draft.items.map((it, n) => (n === i ? { ...it, ...patch } : it)),
    });

  const indexed = draft.items.map((item, i) => ({ item, i }));
  const mapped = indexed.filter(({ item }) => item.bucket === MAPPED);
  const check = indexed.filter(({ item }) => item.bucket === CHECK);
  const unmapped = indexed.filter(({ item }) => item.bucket === UNMAPPED);

  return (
    <>
      <section className={styles.card}>
        <label className={styles.label} htmlFor="title">
          요리 이름
        </label>
        <input
          id="title"
          className={styles.input}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
        <p className={styles.hint}>
          재료 {draft.items.length} · 만드는 법 {draft.steps.length}단계
        </p>
      </section>

      {/* 확인 필요 — 이것만 펼쳐서 물어본다 */}
      {check.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>이것만 확인해주세요</h2>
          <ul className={styles.checkList}>
            {check.map(({ item, i }) => (
              <li key={i} className={styles.checkItem}>
                <Editable
                  item={item}
                  open={editing === i}
                  onOpen={() => setEditing(editing === i ? null : i)}
                  onChange={(patch) => set(i, patch)}
                />
                {item.evidence && <p className={styles.why}>{item.evidence}</p>}
                {/*
                  답하기 전에는 어느 쪽도 고른 것처럼 보이면 안 된다.
                  안 물어본 걸 답한 척하는 셈이고, 사용자가 "이미 골랐네" 하고
                  넘어가면 그 기본값이 조용히 확정된다.
                */}
                <div className={styles.yesno}>
                  <button
                    type="button"
                    className={
                      item.answered && item.confirmed ? styles.picked : styles.choice
                    }
                    onClick={() => set(i, { confirmed: true, answered: true })}
                  >
                    넣을게요
                  </button>
                  <button
                    type="button"
                    className={
                      item.answered && !item.confirmed ? styles.picked : styles.choice
                    }
                    onClick={() => set(i, { confirmed: false, answered: true })}
                  >
                    아니요
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 확정 — 뭉쳐서 접어둔다 */}
      {mapped.length > 0 && (
        <section className={styles.card}>
          <button
            type="button"
            className={styles.foldHead}
            onClick={() => setOpenMapped(!openMapped)}
            aria-expanded={openMapped}
          >
            <span>다 알아봤어요 {mapped.length}개</span>
            <span className={styles.hint}>{openMapped ? "접기" : "펼치기"}</span>
          </button>
          {openMapped ? (
            <ul className={styles.checkList}>
              {mapped.map(({ item, i }) => (
                <li key={i} className={styles.checkItem}>
                  <Editable
                    item={item}
                    open={editing === i}
                    onOpen={() => setEditing(editing === i ? null : i)}
                    onChange={(patch) => set(i, patch)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.chips}>
              {mapped.map(({ item }) => item.label).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* 미분류 — 원문 그대로 저장한다. 추측하지 않는다 */}
      {unmapped.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>처음 보는 재료예요</h2>
          <p className={styles.body}>
            적힌 그대로 저장할게요. 장보기에서는 따로 한 줄로 나와요.
          </p>
          <ul className={styles.checkList}>
            {unmapped.map(({ item, i }) => (
              <li key={i} className={styles.checkItem}>
                <Editable
                  item={item}
                  open={editing === i}
                  onOpen={() => setEditing(editing === i ? null : i)}
                  onChange={(patch) => set(i, patch)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        className={styles.primary}
        disabled={saving}
        onClick={() => onSave(draft)}
      >
        {saving ? "저장하는 중이에요" : "저장할게요"}
      </button>
      <button type="button" className={styles.quiet} onClick={onBack} disabled={saving}>
        다시 올릴래요
      </button>
    </>
  );
}

/** 탭하면 이름과 수량을 직접 고칠 수 있다 (지시서 4장) */
function Editable({
  item,
  open,
  onOpen,
  onChange,
}: {
  item: DraftItem;
  open: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<DraftItem>) => void;
}) {
  if (!open) {
    return (
      <button type="button" className={styles.nameRow} onClick={onOpen}>
        <span className={styles.name}>{item.label}</span>
        {item.raw_qty && <span className={styles.qty}>{item.raw_qty}</span>}
      </button>
    );
  }
  return (
    <div className={styles.editRow}>
      <input
        className={styles.input}
        value={item.raw_name}
        aria-label="재료 이름"
        onChange={(e) => onChange({ raw_name: e.target.value })}
      />
      <input
        className={styles.qtyInput}
        value={item.raw_qty ?? ""}
        aria-label="수량"
        placeholder="수량"
        onChange={(e) => onChange({ raw_qty: e.target.value })}
      />
      <button type="button" className={styles.done} onClick={onOpen}>
        됐어요
      </button>
    </div>
  );
}
