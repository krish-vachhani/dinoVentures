interface LoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function LoadMore({ hasNextPage, isFetchingNextPage, onLoadMore }: LoadMoreProps) {
  if (!hasNextPage) return null;
  return (
    <div className="load-more">
      <button type="button" className="button button--ghost" disabled={isFetchingNextPage} onClick={onLoadMore}>
        {isFetchingNextPage ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
