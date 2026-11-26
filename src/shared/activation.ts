export type NavigatorCommand =
  | { kind: "cancel" | "overview" }
  | { kind: "find" | "focus" | "describe" | "blocked"; target: string }
  | { kind: "open" | "close" | "activate" | "select"; target: string };

export function parseNavigatorCommand(input: string): NavigatorCommand {
  const text = input.trim().toLowerCase().replace(/^please\s+/, "").replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  if (/^(cancel|never mind|stop waiting)$/.test(text)) return { kind: "cancel" };
  if (/^(?:(?:give me|show me) (?:a |the )?)?(?:page overview|overview of (?:this|the) page)$/.test(text)) return { kind: "overview" };
  if (/^(?:what (?:does|are|is)|explain|describe|tell me about)\b/.test(text)) {
    return { kind: "describe", target: text.replace(/^(?:what (?:does|are|is)|explain|describe|tell me about)\s+/, "").replace(/\s+do$/, "") };
  }
  const verb = /^(take me to|go to|move focus to|focus(?: on)?|find|locate|open|expand|collapse|close|select|choose|click|activate|press|submit|pay|purchase|buy|delete|remove|download|send|save|accept|transfer|sign|change)\s+(.+)$/.exec(text);
  if (!verb) return { kind: "find", target: input };
  const [, action = "", rawTarget = ""] = verb;
  const target = rawTarget.replace(/^(?:the|a|an)\s+/, "");
  if (/^(take me to|go to|move focus to|focus(?: on)?)$/.test(action)) return { kind: "focus", target };
  if (/^(find|locate)$/.test(action)) return { kind: "find", target };
  if (/^(open|expand|collapse|close|select|choose|click|activate|press)$/.test(action) &&
    !/[;\n\r]|\b(?:and then|then)\b|\band (?:open|expand|collapse|close|select|choose|click|activate|press|submit|pay|buy|delete|send|download)\b/.test(input.toLowerCase())) {
    const kind = /^(open|expand)$/.test(action) ? "open" : /^(collapse|close)$/.test(action) ? "close" :
      /^(select|choose)$/.test(action) ? "select" : "activate";
    return { kind, target };
  }
  return { kind: "blocked", target };
}

export function refersToCurrentControl(target: string): boolean {
  return /^(?:(?:this|current|currently focused|focused) (?:control|button|section|menu|options)|(?:my|available) options|options|it)$/.test(target);
}
