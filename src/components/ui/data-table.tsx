import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface CategoryFilterOption {
  id: string
  value: string
  label: string
}

interface CategoryGroup {
  id: string
  name: string
  subcategories: CategoryFilterOption[]
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  onRowClick?: (row: TData) => void
  getRowClassName?: (row: TData) => string
  categoryFilterKey?: string
  categoryFilterOptions?: CategoryFilterOption[]
  categoryFilterGroups?: CategoryGroup[]
  categoryFilterPlaceholder?: string
  initialCategoryFilter?: string
  /** Column ids to force-hide (e.g. on mobile show only Name, Date, Amount) */
  forceHiddenColumnIds?: string[]
  /** Use compact row/header padding (e.g. for mobile) */
  compact?: boolean
  /** Override column order (e.g. ['Description', 'Date', 'Amount'] for mobile) */
  columnOrder?: string[]
  /** Called when a row is swiped right past the threshold */
  onSwipeRight?: (row: TData) => void
  /** Returns 'confirm' or 'unconfirm' to determine swipe indicator color/icon */
  getSwipeAction?: (row: TData) => 'confirm' | 'unconfirm'
  /** Extra filter controls rendered next to the category filter */
  extraFilters?: React.ReactNode
  /** Hide the built-in search bar (e.g. when providing an external one) */
  hideSearchBar?: boolean
  /** External controlled value for global filter */
  externalGlobalFilter?: string
  /** External controlled value for category filter */
  externalCategoryFilter?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
  onRowClick,
  getRowClassName,
  categoryFilterKey,
  categoryFilterOptions = [],
  categoryFilterGroups = [],
  categoryFilterPlaceholder = "Filter by category",
  initialCategoryFilter,
  forceHiddenColumnIds,
  compact = false,
  columnOrder: columnOrderProp,
  onSwipeRight,
  getSwipeAction,
  extraFilters,
  hideSearchBar = false,
  externalGlobalFilter,
  externalCategoryFilter,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnOrderState, setColumnOrderState] = React.useState<string[] | undefined>(() => columnOrderProp)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(() => {
    // Initialize with category filter if provided
    if (initialCategoryFilter && categoryFilterKey) {
      return [{ id: categoryFilterKey, value: initialCategoryFilter }]
    }
    return []
  })
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

  const effectiveColumnVisibility: VisibilityState = React.useMemo(() => ({
    ...columnVisibility,
    ...(forceHiddenColumnIds?.length
      ? Object.fromEntries(forceHiddenColumnIds.map((id) => [id, false]))
      : {}),
  }), [columnVisibility, forceHiddenColumnIds])
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState("")

  // Sync external global filter
  React.useEffect(() => {
    if (externalGlobalFilter !== undefined) {
      setGlobalFilter(externalGlobalFilter)
    }
  }, [externalGlobalFilter])

  // Sync external category filter
  React.useEffect(() => {
    if (externalCategoryFilter === undefined || !categoryFilterKey) return
    setColumnFilters(prev => {
      const without = prev.filter(f => f.id !== categoryFilterKey)
      if (externalCategoryFilter === 'all' || externalCategoryFilter === '') {
        return without
      }
      return [...without, { id: categoryFilterKey, value: externalCategoryFilter }]
    })
  }, [externalCategoryFilter, categoryFilterKey])

  // Swipe-to-confirm state
  const SWIPE_THRESHOLD = 80
  const [swipeRowId, setSwipeRowId] = React.useState<string | null>(null)
  const [swipeDx, setSwipeDx] = React.useState(0)
  const swipeTouchStartX = React.useRef(0)
  const swipeTouchStartY = React.useRef(0)
  const swipeIsHorizontal = React.useRef<boolean | null>(null)
  const swipeTriggeredRef = React.useRef(false)

  // Sync column order from prop (e.g. mobile order); clear when prop is undefined
  React.useEffect(() => {
    setColumnOrderState(columnOrderProp)
  }, [columnOrderProp])

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrderState,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    initialState: {
      pagination: {
        pageSize: 30,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility: effectiveColumnVisibility,
      ...(columnOrderState != null && { columnOrder: columnOrderState }),
      rowSelection,
      globalFilter,
    },
  })

  // Update category filter when initialCategoryFilter prop changes
  React.useEffect(() => {
    if (initialCategoryFilter && categoryFilterKey) {
      const currentFilter = columnFilters.find(f => f.id === categoryFilterKey)
      if (!currentFilter || currentFilter.value !== initialCategoryFilter) {
        setColumnFilters(prev => {
          const filtered = prev.filter(f => f.id !== categoryFilterKey)
          return [...filtered, { id: categoryFilterKey, value: initialCategoryFilter }]
        })
      }
    }
  }, [initialCategoryFilter, categoryFilterKey, columnFilters])

  const categoryFilterValue = categoryFilterKey
    ? (table.getColumn(categoryFilterKey)?.getFilterValue() as string | undefined) ?? "all"
    : "all"

  return (
    <div className="w-full space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-4 flex-1">
          {!hideSearchBar && searchKey && (
            <Input
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                table.getColumn(searchKey)?.setFilterValue(event.target.value)
              }
              className="max-w-sm"
            />
          )}
          {!hideSearchBar && !searchKey && (
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="max-w-sm"
            />
          )}
          {extraFilters}
          {categoryFilterKey && (categoryFilterGroups.length > 0 || categoryFilterOptions.length > 0) && (
            <Select
              value={categoryFilterValue}
              onValueChange={(value) => {
                if (value === "all") {
                  table.getColumn(categoryFilterKey)?.setFilterValue(undefined)
                } else {
                  table.getColumn(categoryFilterKey)?.setFilterValue(value)
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={categoryFilterPlaceholder} />
              </SelectTrigger>
              <SelectContent className="w-[200px]">
                <SelectItem value="all">All Categories</SelectItem>
                {categoryFilterGroups.length > 0 ? (
                  categoryFilterGroups.map((group, index) => (
                    <React.Fragment key={group.id}>
                      <SelectGroup>
                        <SelectLabel>{group.name}</SelectLabel>
                        {group.subcategories.map((option) => (
                          <SelectItem key={option.id} value={option.value}>
                            {option.label || option.value}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {index < categoryFilterGroups.length - 1 && <SelectSeparator />}
                    </React.Fragment>
                  ))
                ) : (
                  categoryFilterOptions.map((option) => (
                    <SelectItem key={option.id} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="rounded-md border overflow-auto flex-1 min-h-0">
        <Table>
          {!compact && (
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header, headerIndex) => {
                    return (
                      <TableHead 
                        key={header.id}
                        className={cn(
                          headerIndex === 0 ? "pl-6" : "",
                          compact && "px-2 py-1.5 h-9"
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
          )}
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const isSwipingThis = swipeRowId === row.id
                const dx = isSwipingThis ? swipeDx : 0
                const swipeAction = getSwipeAction?.(row.original) ?? 'confirm'
                const indicatorBg = swipeAction === 'confirm' ? '#22c55e' : '#f59e0b'
                const IndicatorIcon = swipeAction === 'confirm' ? Check : Undo2
                const cells = row.getVisibleCells()

                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={`${onRowClick ? "cursor-pointer" : ""} ${getRowClassName?.(row.original) || ""}`}
                    onClick={() => {
                      if (swipeTriggeredRef.current) return
                      onRowClick?.(row.original)
                    }}
                    onTouchStart={onSwipeRight ? (e) => {
                      swipeTouchStartX.current = e.touches[0].clientX
                      swipeTouchStartY.current = e.touches[0].clientY
                      swipeIsHorizontal.current = null
                      swipeTriggeredRef.current = false
                      setSwipeRowId(row.id)
                      setSwipeDx(0)
                    } : undefined}
                    onTouchMove={onSwipeRight ? (e) => {
                      const deltaX = e.touches[0].clientX - swipeTouchStartX.current
                      const deltaY = e.touches[0].clientY - swipeTouchStartY.current
                      // Determine direction on first significant move
                      if (swipeIsHorizontal.current === null && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
                        swipeIsHorizontal.current = Math.abs(deltaX) > Math.abs(deltaY)
                      }
                      if (!swipeIsHorizontal.current) return
                      if (deltaX > 0) {
                        e.preventDefault()
                        setSwipeDx(Math.min(deltaX, SWIPE_THRESHOLD + 20))
                      }
                    } : undefined}
                    onTouchEnd={onSwipeRight ? () => {
                      if (swipeDx >= SWIPE_THRESHOLD) {
                        swipeTriggeredRef.current = true
                        onSwipeRight(row.original)
                      }
                      setSwipeRowId(null)
                      setSwipeDx(0)
                      swipeIsHorizontal.current = null
                    } : undefined}
                  >
                    {cells.map((cell, cellIndex) => {
                      const isFirstCell = cellIndex === 0
                      const contentStyle: React.CSSProperties = onSwipeRight ? {
                        transform: `translateX(${dx}px)`,
                        transition: isSwipingThis ? 'none' : 'transform 0.2s ease-out',
                      } : {}

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            !isFirstCell && !compact ? "pl-3" : "",
                            compact && "px-2 py-1.5",
                            isFirstCell && !onSwipeRight && !compact ? "pl-6" : "",
                          )}
                          style={isFirstCell && onSwipeRight ? { padding: 0 } : undefined}
                        >
                          {isFirstCell && onSwipeRight ? (
                            <div style={{ position: 'relative', overflow: 'hidden' }}>
                              {/* Swipe action indicator */}
                              <div style={{
                                position: 'absolute',
                                left: -SWIPE_THRESHOLD,
                                top: 0,
                                bottom: 0,
                                width: SWIPE_THRESHOLD,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: indicatorBg,
                                transform: `translateX(${dx}px)`,
                                transition: isSwipingThis ? 'none' : 'transform 0.2s ease-out',
                              }}>
                                <IndicatorIcon size={20} style={{ color: 'white' }} />
                              </div>
                              {/* Cell content */}
                              <div style={{
                                ...contentStyle,
                                paddingLeft: compact ? '8px' : '24px',
                                paddingTop: compact ? '6px' : '12px',
                                paddingBottom: compact ? '6px' : '12px',
                              }}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            </div>
                          ) : (
                            <div style={contentStyle}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[30, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length > 0 ? (
              <>
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )}{" "}
                of {table.getFilteredRowModel().rows.length} result(s)
              </>
            ) : (
              "No results"
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 lg:gap-8">
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

