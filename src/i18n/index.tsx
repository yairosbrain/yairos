import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import he from "./he.json";
import en from "./en.json";
import type { Lang } from "../types";
import { getSettings, patchSettings } from "../data/localSettings";

const dicts: Record<Lang, Record<string, string>> = { he, en };

interface I18nCtx {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (key: string, vars?: Record<string, string>) => string;
  setLang: (lang: Lang) => void;
}

const Ctx = createContext<I18nCtx>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getSettings().language);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    patchSettings({ language: l });
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      let s = dicts[lang][key] ?? dicts.he[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
      }
      return s;
    },
    [lang]
  );

  const value = useMemo<I18nCtx>(
    () => ({ lang, dir: lang === "he" ? "rtl" : "ltr", t, setLang }),
    [lang, t, setLang]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
