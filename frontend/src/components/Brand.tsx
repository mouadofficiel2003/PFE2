import { Link } from "react-router-dom";
import type { CSSProperties } from "react";

type BrandProps = {
  /** When false, renders as a plain span instead of a link to /dashboard. */
  asLink?: boolean;
  /** Visual size of the logo. */
  size?: "md" | "lg";
};

export default function Brand({ asLink = true, size = "md" }: BrandProps) {
  const isLg = size === "lg";
  const content = (
    <img
      src="/mef-logo.png"
      alt="Ministère de l'Économie et des Finances — Royaume du Maroc"
      style={isLg ? logoLg : logo}
    />
  );

  if (!asLink) {
    return <span style={root}>{content}</span>;
  }

  return (
    <Link to="/dashboard" style={{ ...root, textDecoration: "none" }} aria-label="Accueil">
      {content}
    </Link>
  );
}

const root: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
};

const logo: CSSProperties = {
  display: "block",
  height: "3rem",
  width: "auto",
  objectFit: "contain",
};

const logoLg: CSSProperties = {
  ...logo,
  height: "5.5rem",
};
