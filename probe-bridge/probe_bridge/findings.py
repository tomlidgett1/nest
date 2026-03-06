"""Manages the centralised findings file for prompt reverse-engineering."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("probe_bridge.findings")

FINDINGS_FILENAME = "findings.json"


def _compute_message_metrics(text: str) -> dict[str, Any]:
    """Compute quantitative metrics for a single bot message."""
    words = text.split()
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    emoji_pattern = re.compile(
        "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002600-\U000026FF]+",
        flags=re.UNICODE,
    )
    emojis = emoji_pattern.findall(text)

    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "char_count": len(text),
        "emoji_count": len(emojis),
        "has_bullet_points": bool(re.search(r'^[\s]*[-•*]\s', text, re.MULTILINE)),
        "has_numbered_list": bool(re.search(r'^[\s]*\d+[.)]\s', text, re.MULTILINE)),
        "has_bold": "**" in text or "__" in text,
        "exclamation_count": text.count("!"),
        "question_count": text.count("?"),
        "line_count": len(text.strip().splitlines()),
    }


def _compute_flow_metrics(probe_text: str, bot_text: str) -> dict[str, Any]:
    """Analyse how the bot's response connects to what we said."""
    probe_lower = probe_text.lower()
    bot_lower = bot_text.lower()
    probe_words = set(probe_lower.split())
    bot_words = set(bot_lower.split())

    # Word echo: how many of our words appear in the response
    stopwords = {"i", "you", "the", "a", "an", "is", "are", "was", "were", "it", "to",
                 "of", "in", "for", "on", "with", "at", "by", "do", "does", "did", "be",
                 "have", "has", "had", "that", "this", "and", "or", "but", "not", "so",
                 "if", "my", "me", "your", "we", "they", "them", "what", "how", "can",
                 "just", "like", "about", "from", "up", "out", "no", "yes"}
    probe_content = probe_words - stopwords
    echoed = probe_content & bot_words
    echo_ratio = len(echoed) / max(len(probe_content), 1)

    # Does bot start with acknowledgment?
    ack_starters = ["oh", "haha", "lol", "yeah", "yes", "sure", "right", "interesting",
                     "good question", "great question", "nice", "cool", "wow", "hmm",
                     "ah", "ooh", "that's", "thats", "totally", "absolutely", "definitely",
                     "for sure", "of course", "i see", "got it", "makes sense"]
    starts_with_ack = any(bot_lower.lstrip().startswith(a) for a in ack_starters)

    # Does bot rephrase our question?
    probe_has_question = "?" in probe_text
    bot_rephrases = False
    if probe_has_question and echo_ratio > 0.3:
        bot_rephrases = True

    # Response length ratio (bot words / probe words)
    probe_wc = len(probe_text.split())
    bot_wc = len(bot_text.split())
    length_ratio = bot_wc / max(probe_wc, 1)

    # Does bot end with a question (keeping conversation going)?
    ends_with_question = bot_text.rstrip().endswith("?")

    # Does bot reference earlier context? (words like "earlier", "before", "you mentioned", "you said")
    context_refs = ["earlier", "before", "you mentioned", "you said", "you asked",
                    "you were saying", "going back to", "like you said", "as you said",
                    "remember when", "you told me"]
    references_context = any(ref in bot_lower for ref in context_refs)

    return {
        "echo_ratio": round(echo_ratio, 2),
        "echoed_words": sorted(echoed) if echoed else [],
        "starts_with_acknowledgment": starts_with_ack,
        "rephrases_question": bot_rephrases,
        "length_ratio": round(length_ratio, 2),
        "ends_with_question": ends_with_question,
        "references_earlier_context": references_context,
    }


@dataclass
class Findings:
    conversation_history: list[dict[str, Any]] = field(default_factory=list)
    analysis: str = ""
    strategy_notes: str = ""
    current_phase: int = 1
    confidence: float = 0.0
    bot_metrics: dict[str, Any] = field(default_factory=lambda: {
        "total_bot_turns": 0,
        "total_word_count": 0,
        "avg_words_per_turn": 0.0,
        "min_words": None,
        "max_words": None,
        "total_emojis": 0,
        "total_questions_asked": 0,
        "total_exclamations": 0,
        "bullet_point_turns": 0,
        "bold_turns": 0,
        # Multi-bubble delivery tracking
        "total_bubbles_sent": 0,
        "avg_bubbles_per_turn": 0.0,
        "multi_bubble_turns": 0,
        "single_bubble_turns": 0,
        "max_bubbles_in_turn": 0,
        "bubble_length_distribution": [],
        # Follow-up behaviour
        "turns_with_follow_up_question": 0,
        "turns_ending_with_question": 0,
        # Tone markers
        "turns_with_emojis": 0,
        "turns_with_exclamations": 0,
        "ellipsis_count": 0,
        "em_dash_count": 0,
    })
    metadata: dict[str, Any] = field(default_factory=lambda: {
        "total_messages": 0,
        "total_bot_turns": 0,
        "total_probe_turns": 0,
        "started_at": None,
        "last_updated": None,
    })
    _path: Path = field(default=Path.home() / ".config" / "probe-bridge" / FINDINGS_FILENAME, repr=False)

    def _update_bot_metrics(self, bot_text: str, bubble_count: int = 1, bubble_texts: list[str] | None = None) -> None:
        metrics = _compute_message_metrics(bot_text)
        bm = self.bot_metrics

        bm["total_bot_turns"] = bm.get("total_bot_turns", 0) + 1
        bm["total_word_count"] = bm.get("total_word_count", 0) + metrics["word_count"]
        bm["avg_words_per_turn"] = bm["total_word_count"] / bm["total_bot_turns"]

        wc = metrics["word_count"]
        if bm.get("min_words") is None or wc < bm["min_words"]:
            bm["min_words"] = wc
        if bm.get("max_words") is None or wc > bm["max_words"]:
            bm["max_words"] = wc

        bm["total_emojis"] = bm.get("total_emojis", 0) + metrics["emoji_count"]
        bm["total_questions_asked"] = bm.get("total_questions_asked", 0) + metrics["question_count"]
        bm["total_exclamations"] = bm.get("total_exclamations", 0) + metrics["exclamation_count"]
        if metrics["has_bullet_points"]:
            bm["bullet_point_turns"] = bm.get("bullet_point_turns", 0) + 1
        if metrics["has_bold"]:
            bm["bold_turns"] = bm.get("bold_turns", 0) + 1

        # Multi-bubble delivery tracking
        bm["total_bubbles_sent"] = bm.get("total_bubbles_sent", 0) + bubble_count
        bm["avg_bubbles_per_turn"] = bm["total_bubbles_sent"] / bm["total_bot_turns"]
        if bubble_count > 1:
            bm["multi_bubble_turns"] = bm.get("multi_bubble_turns", 0) + 1
        else:
            bm["single_bubble_turns"] = bm.get("single_bubble_turns", 0) + 1
        if bubble_count > bm.get("max_bubbles_in_turn", 0):
            bm["max_bubbles_in_turn"] = bubble_count

        if bubble_texts:
            bubble_lengths = [len(b.split()) for b in bubble_texts]
            dist = bm.get("bubble_length_distribution", [])
            dist.append(bubble_lengths)
            # Keep last 50 turns of distribution data
            bm["bubble_length_distribution"] = dist[-50:]

        # Follow-up question tracking
        if metrics["question_count"] > 0:
            bm["turns_with_follow_up_question"] = bm.get("turns_with_follow_up_question", 0) + 1
        if bot_text.rstrip().endswith("?"):
            bm["turns_ending_with_question"] = bm.get("turns_ending_with_question", 0) + 1

        # Tone markers
        if metrics["emoji_count"] > 0:
            bm["turns_with_emojis"] = bm.get("turns_with_emojis", 0) + 1
        if metrics["exclamation_count"] > 0:
            bm["turns_with_exclamations"] = bm.get("turns_with_exclamations", 0) + 1
        bm["ellipsis_count"] = bm.get("ellipsis_count", 0) + bot_text.count("...")
        bm["em_dash_count"] = bm.get("em_dash_count", 0) + bot_text.count("—") + bot_text.count("--")

    def _update_flow_metrics(self, flow: dict[str, Any]) -> None:
        """Update aggregate flow/connection metrics."""
        bm = self.bot_metrics
        if not flow:
            return

        # Track acknowledgment pattern
        if flow.get("starts_with_acknowledgment"):
            bm["turns_starting_with_ack"] = bm.get("turns_starting_with_ack", 0) + 1

        # Track echo behaviour
        echo_ratios = bm.get("echo_ratios", [])
        echo_ratios.append(flow.get("echo_ratio", 0))
        bm["echo_ratios"] = echo_ratios[-50:]
        bm["avg_echo_ratio"] = round(sum(bm["echo_ratios"]) / len(bm["echo_ratios"]), 2)

        # Track length adaptation
        length_ratios = bm.get("length_ratios", [])
        length_ratios.append(flow.get("length_ratio", 0))
        bm["length_ratios"] = length_ratios[-50:]
        bm["avg_length_ratio"] = round(sum(bm["length_ratios"]) / len(bm["length_ratios"]), 2)

        # Track context referencing
        if flow.get("references_earlier_context"):
            bm["turns_referencing_context"] = bm.get("turns_referencing_context", 0) + 1

        # Track question rephrasing
        if flow.get("rephrases_question"):
            bm["turns_rephrasing_question"] = bm.get("turns_rephrasing_question", 0) + 1

    def get_bot_metrics_summary(self) -> str:
        """Format bot metrics as a readable summary for the LLM prompt."""
        bm = self.bot_metrics
        total = bm.get("total_bot_turns", 0)
        if total == 0:
            return "(No bot messages yet)"

        lines = [
            f"Bot turns analysed: {total}",
            f"Avg words/turn: {bm.get('avg_words_per_turn', 0):.1f} (range: {bm.get('min_words', 0)}-{bm.get('max_words', 0)})",
            f"Multi-bubble turns: {bm.get('multi_bubble_turns', 0)}/{total} ({bm.get('avg_bubbles_per_turn', 0):.1f} avg bubbles/turn, max {bm.get('max_bubbles_in_turn', 0)})",
            f"Turns with emojis: {bm.get('turns_with_emojis', 0)}/{total}",
            f"Turns with exclamations: {bm.get('turns_with_exclamations', 0)}/{total}",
            f"Turns with follow-up questions: {bm.get('turns_with_follow_up_question', 0)}/{total}",
            f"Turns ending with question: {bm.get('turns_ending_with_question', 0)}/{total}",
            f"Total emojis used: {bm.get('total_emojis', 0)}",
            f"Ellipsis usage: {bm.get('ellipsis_count', 0)} total",
            f"Em-dash usage: {bm.get('em_dash_count', 0)} total",
            f"Bullet point turns: {bm.get('bullet_point_turns', 0)}/{total}",
            f"Bold formatting turns: {bm.get('bold_turns', 0)}/{total}",
        ]

        # Recent bubble patterns
        dist = bm.get("bubble_length_distribution", [])
        if dist:
            recent = dist[-5:]
            patterns = [f"  Turn: {' → '.join(f'{w}w' for w in d)}" for d in recent]
            lines.append("Recent bubble patterns (words per bubble):")
            lines.extend(patterns)

        # Flow/connection metrics
        lines.append("")
        lines.append("--- RESPONSE FLOW PATTERNS ---")
        lines.append(f"Starts with acknowledgment: {bm.get('turns_starting_with_ack', 0)}/{total}")
        lines.append(f"Avg word echo ratio: {bm.get('avg_echo_ratio', 0):.0%} (how much it mirrors your words)")
        lines.append(f"Avg length ratio: {bm.get('avg_length_ratio', 0):.1f}x (bot words / your words)")
        lines.append(f"References earlier context: {bm.get('turns_referencing_context', 0)}/{total}")
        lines.append(f"Rephrases your question: {bm.get('turns_rephrasing_question', 0)}/{total}")

        # Recent flow patterns
        recent_flows = []
        for m in reversed(self.conversation_history):
            if m["role"] == "bot" and m.get("flow"):
                recent_flows.append(m["flow"])
                if len(recent_flows) >= 5:
                    break
        if recent_flows:
            recent_flows.reverse()
            lines.append("Recent flow patterns:")
            for f in recent_flows:
                parts = []
                if f.get("starts_with_acknowledgment"):
                    parts.append("ACK")
                if f.get("echoed_words"):
                    parts.append(f"echoes:{','.join(f['echoed_words'][:3])}")
                parts.append(f"ratio:{f.get('length_ratio', 0):.1f}x")
                if f.get("ends_with_question"):
                    parts.append("ends-with-?")
                if f.get("references_earlier_context"):
                    parts.append("refs-context")
                lines.append(f"  [{' | '.join(parts)}]")

        return "\n".join(lines)

    def add_exchange(
        self,
        bot_message: str,
        our_reply: str,
        analysis: str,
        strategy_notes: str,
        phase: str = "1",
        confidence: str = "0.0",
        bubble_count: int = 1,
        bubble_texts: list[str] | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()

        bot_metrics = _compute_message_metrics(bot_message)

        # Compute flow metrics: how does this response connect to our last message?
        last_probe = ""
        for m in reversed(self.conversation_history):
            if m["role"] == "probe":
                last_probe = m["content"]
                break
        flow = _compute_flow_metrics(last_probe, bot_message) if last_probe else {}

        bot_entry: dict[str, Any] = {
            "role": "bot",
            "content": bot_message,
            "timestamp": now,
            "metrics": bot_metrics,
            "flow": flow,
            "bubble_count": bubble_count,
        }
        if bubble_texts and len(bubble_texts) > 1:
            bot_entry["bubbles"] = bubble_texts
        self.conversation_history.append(bot_entry)

        self.conversation_history.append({
            "role": "probe",
            "content": our_reply,
            "timestamp": now,
        })

        self._update_bot_metrics(bot_message, bubble_count=bubble_count, bubble_texts=bubble_texts)
        self._update_flow_metrics(flow)
        self.analysis = analysis
        self.strategy_notes = strategy_notes

        try:
            self.current_phase = int(phase)
        except (ValueError, TypeError):
            pass
        try:
            self.confidence = float(confidence)
        except (ValueError, TypeError):
            pass

        self.metadata["total_messages"] = len(self.conversation_history)
        self.metadata["total_bot_turns"] = sum(1 for m in self.conversation_history if m["role"] == "bot")
        self.metadata["total_probe_turns"] = sum(1 for m in self.conversation_history if m["role"] == "probe")
        self.metadata["last_updated"] = now
        if not self.metadata.get("started_at"):
            self.metadata["started_at"] = now

    def add_outbound(self, our_message: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.conversation_history.append({
            "role": "probe",
            "content": our_message,
            "timestamp": now,
        })
        self.metadata["total_messages"] = len(self.conversation_history)
        self.metadata["total_probe_turns"] = sum(1 for m in self.conversation_history if m["role"] == "probe")
        self.metadata["last_updated"] = now
        if not self.metadata.get("started_at"):
            self.metadata["started_at"] = now

    def get_conversation_for_prompt(self) -> list[dict[str, str]]:
        return [
            {"role": m["role"], "content": m["content"]}
            for m in self.conversation_history
        ]

    def get_topics_explored(self) -> str:
        """Build a concise list of every question/topic already sent, so the agent avoids repeats."""
        probes = [
            m["content"] for m in self.conversation_history
            if m["role"] == "probe"
        ]
        if not probes:
            return "(No messages sent yet)"

        lines = [f"{i+1}. {p}" for i, p in enumerate(probes)]
        return "\n".join(lines)

    def save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "conversation_history": self.conversation_history,
            "analysis": self.analysis,
            "strategy_notes": self.strategy_notes,
            "current_phase": self.current_phase,
            "confidence": self.confidence,
            "bot_metrics": self.bot_metrics,
            "metadata": self.metadata,
        }
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._path)
        logger.info(
            "Findings saved (phase %d, confidence %.0f%%, %d messages, %d chars analysis)",
            self.current_phase,
            self.confidence * 100,
            len(self.conversation_history),
            len(self.analysis),
        )

    @classmethod
    def load(cls, findings_dir: Path) -> Findings:
        path = findings_dir / FINDINGS_FILENAME
        if path.exists():
            try:
                data = json.loads(path.read_text())
                findings = cls(
                    conversation_history=data.get("conversation_history", []),
                    analysis=data.get("analysis", ""),
                    strategy_notes=data.get("strategy_notes", ""),
                    current_phase=data.get("current_phase", 1),
                    confidence=data.get("confidence", 0.0),
                    bot_metrics=data.get("bot_metrics", {}),
                    metadata=data.get("metadata", {}),
                    _path=path,
                )
                logger.info(
                    "Loaded findings: phase %d, confidence %.0f%%, %d messages",
                    findings.current_phase,
                    findings.confidence * 100,
                    len(findings.conversation_history),
                )
                return findings
            except (json.JSONDecodeError, KeyError) as exc:
                logger.warning("Corrupt findings file, starting fresh: %s", exc)
        return cls(_path=path)
