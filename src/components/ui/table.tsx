import * as React from "react";

import { cn } from "@/lib/utils";

function prepareMobileTable(table: HTMLTableElement) {
  table.classList.add("mobile-card-table");
  table.setAttribute("role", table.getAttribute("role") ?? "table");
  table.tHead?.setAttribute("role", table.tHead.getAttribute("role") ?? "rowgroup");
  table.tFoot?.setAttribute("role", table.tFoot.getAttribute("role") ?? "rowgroup");
  Array.from(table.tBodies).forEach((body) => body.setAttribute("role", body.getAttribute("role") ?? "rowgroup"));

  [table.tHead, ...Array.from(table.tBodies), table.tFoot].filter(Boolean).forEach((section) => {
    Array.from(section!.rows).forEach((row) => {
      row.setAttribute("role", row.getAttribute("role") ?? "row");
      Array.from(row.cells).forEach((cell) => {
        const role = cell.getAttribute("role") ?? (cell.tagName === "TH"
          ? cell.getAttribute("scope") === "row" ? "rowheader" : "columnheader"
          : "cell");
        cell.setAttribute("role", role);
      });
    });
  });

  const headerRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headerRow) return;

  const labels: string[] = [];
  Array.from(headerRow.cells).forEach((cell) => {
    const label = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
    labels.push(label, ...Array.from({ length: Math.max(0, cell.colSpan - 1) }, () => ""));
  });

  Array.from(table.tBodies).forEach((body) => {
    Array.from(body.rows).forEach((row) => {
      let columnIndex = 0;
      Array.from(row.cells).forEach((cell) => {
        const label = labels[columnIndex];
        if (label) cell.dataset.mobileLabel = label;
        else delete cell.dataset.mobileLabel;
        columnIndex += cell.colSpan;
      });
    });
  });
}

/** Adapts native HTML tables used by a few legacy screens to the mobile card layout. */
function MobileTableAdapter() {
  React.useLayoutEffect(() => {
    document.querySelectorAll("table").forEach(prepareMobileTable);
    const observer = new MutationObserver((records) => {
      const changedTables = new Set<HTMLTableElement>();
      records.forEach(({ addedNodes, target }) => {
        const table = target instanceof Element ? target.closest("table") : null;
        if (table) changedTables.add(table);
        addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLTableElement) changedTables.add(node);
          node.querySelectorAll("table").forEach((addedTable) => changedTables.add(addedTable));
          const parentTable = node.closest("table");
          if (parentTable) changedTables.add(parentTable);
        });
      });
      changedTables.forEach(prepareMobileTable);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, children, ...props }, ref) => {
    const tableRef = React.useRef<HTMLTableElement | null>(null);
    const setTableRef = React.useCallback((node: HTMLTableElement | null) => {
      tableRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }, [ref]);

    React.useLayoutEffect(() => {
      if (tableRef.current) prepareMobileTable(tableRef.current);
    }, [children]);

    return (
      <div className="relative w-full overflow-auto overscroll-x-contain [touch-action:pan-x_pan-y]">
        <table ref={setTableRef} className={cn("mobile-card-table w-full caption-bottom text-sm", className)} {...props} role={props.role ?? "table"}>
          {children}
        </table>
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} role={props.role ?? "rowgroup"} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} role={props.role ?? "rowgroup"} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} role={props.role ?? "rowgroup"} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b border-border/60 transition-colors data-[state=selected]:bg-accent hover:bg-accent/50", className)}
      {...props}
      role={props.role ?? "row"}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-11 px-4 text-left align-middle text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
      role={props.role ?? (props.scope === "row" ? "rowheader" : "columnheader")}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} role={props.role ?? "cell"} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption, MobileTableAdapter };
