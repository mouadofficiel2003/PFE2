import { Link } from "react-router-dom";
import type { CSSProperties } from "react";

type BrandProps = {
  /** When false, renders as a plain span instead of a link to /candidats. */
  asLink?: boolean;
  /** Visual size of the logo. */
  size?: "md" | "lg";
};

export default function Brand({ asLink = true, size = "md" }: BrandProps) {
  const isLg = size === "lg";
  const content = (
    <>
      <span style={isLg ? markLg : mark} aria-hidden="true">
        C
        <span style={plus}>+</span>
      </span>
      <span style={isLg ? wordmarkLg : wordmark}>
        Candidat<span style={accent}>Plus</span>
      </span>
    </>
  );

  if (!asLink) {
    return <span style={root}>{content}</span>;
  }

  return (
    <Link to="/candidats" style={{ ...root, textDecoration: "none" }} aria-label="CandidatPlus — accueil">
      {content}
    </Link>
  );
}

const root: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.6rem",
  color: "#0f172a",
};

const mark: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  borderRadius: "10px",
  background: "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
  color: "#fff",
  fontWeight: 800,
  fontSize: "1.05rem",
  lineHeight: 1,
  boxShadow: "0 4px 10px rgba(37,99,235,0.30)",
};

const markLg: CSSProperties = {
  ...mark,
  width: "2.75rem",
  height: "2.75rem",
  borderRadius: "14px",
  fontSize: "1.45rem",
};

const plus: CSSProperties = {
  fontSize: "0.7em",
  marginLeft: "0.05em",
  marginTop: "-0.35em",
};

const wordmark: CSSProperties = {
  fontSize: "1.2rem",
  fontWeight: 800,
  letterSpacing: "-0.01em",
};

const wordmarkLg: CSSProperties = {
  ...wordmark,
  fontSize: "1.6rem",
};

const accent: CSSProperties = {
  color: "#2563eb",
};
