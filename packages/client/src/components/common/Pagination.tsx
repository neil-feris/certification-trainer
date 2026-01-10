import styles from './Pagination.module.css';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  const goToPage = (page: number) => {
    onPageChange((page - 1) * limit);
  };

  if (totalPages <= 1) return null;

  return (
    <div className={styles.pagination}>
      <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>
        Previous
      </button>

      <span className={styles.pageInfo}>
        Page {currentPage} of {totalPages}
      </span>

      <button disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)}>
        Next
      </button>
    </div>
  );
}
