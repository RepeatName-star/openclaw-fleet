import React from "react";

export type FiltersProps = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  rightSlot?: React.ReactNode;
};

export default function Filters({ query, onQueryChange, placeholder, rightSlot }: FiltersProps) {
  return (
    <div className="filters">
      <input
        className="filters-input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder ?? "Search"}
      />
      {rightSlot ? <div className="filters-slot">{rightSlot}</div> : null}
    </div>
  );
}
