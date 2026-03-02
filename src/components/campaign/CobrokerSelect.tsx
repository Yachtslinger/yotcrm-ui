"use client";

import React from "react";
import type { BrokerCard as BrokerCardType } from "@/lib/campaign/schema";

export type BrokerCard = BrokerCardType;

const COBROKERS: BrokerCard[] = [
  {
    id: "paolo",
    name: "Paolo Ameglio",
    title: "Yacht Broker",
    phone: "+1 (786) 251-2588",
    email: "pga@denisonyachting.com",
    headshotSrc: "https://denisonyachting.com/wp-content/uploads/2024/10/paolo-ameglio.jpg",
  },
  {
    id: "peter",
    name: "Peter Quintal",
    title: "Yacht Broker",
    phone: "+1 (954) 817-5662",
    email: "peter@denisonyachting.com",
    headshotSrc: "https://denisonyachting.com/wp-content/uploads/2024/10/peter-quintal.jpg",
  },
];

type Props = {
  selected: BrokerCard[];
  onChange: (cards: BrokerCard[]) => void;
  myCard: BrokerCard;
};

export function CobrokerSelect({ selected, onChange, myCard }: Props): React.ReactElement {
  const toggle = (card: BrokerCard) => {
    const exists = selected.some((b) => b.id === card.id);
    const filtered = selected.filter((b) => b.id !== card.id);
    const next = exists ? filtered : [...filtered, card];
    const deduped = next.filter((broker, index, arr) => broker.id !== myCard.id && index === arr.findIndex((b) => b.id === broker.id));
    onChange(deduped);
  };

  return (
    <div className="space-y-3">
      {COBROKERS.map((broker) => {
        const active = selected.some((b) => b.id === broker.id);
        return (
          <label
            key={broker.id}
            className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 ${
              active ? "border-slate-900 bg-slate-900/5" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={active}
              onChange={() => toggle(broker)}
            />
            <div>
              <div className="font-medium">{broker.name}</div>
              <div className="text-xs text-slate-500">{broker.title}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
