import { useState } from "react";
import type { ChatMessage } from "../types/live";
import styles from "./LiveChat.module.css";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string, author: string) => void;
  author: string;
  onAuthorChange: (name: string) => void;
  disabled?: boolean;
}

export function LiveChat({ messages, onSend, author, onAuthorChange, disabled }: Props) {
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, author.trim() || "Anonyme");
    setText("");
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>Chat live</h2>
        <input
          className={styles.nameInput}
          value={author}
          onChange={(e) => onAuthorChange(e.target.value)}
          placeholder="Votre pseudo"
          maxLength={32}
        />
      </header>
      <ul className={styles.messages}>
        {messages.length === 0 ? (
          <li className={styles.empty}>Aucun message — idéal pour les compétitions en direct.</li>
        ) : (
          messages.map((m) => (
            <li key={m.id} className={styles.msg}>
              <span className={styles.author}>{m.author}</span>
              <span className={styles.text}>{m.text}</span>
              <time>{new Date(m.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
            </li>
          ))
        )}
      </ul>
      <form className={styles.form} onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          maxLength={500}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !text.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
