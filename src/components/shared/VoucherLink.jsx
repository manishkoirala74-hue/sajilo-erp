import { useGlobalVoucherDrawer } from '@/lib/GlobalVoucherContext';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Sajilo Voucher Number Formats (examples):
//   Simple    : SI-2026-001, PI-2026-012, JV-202611-12
//   Compound  : PV-FS 2083.084-00019  (prefix "PV-FS", space, fiscal YYYY.NNN, dash, seq)
//   Suffixed  : MYPR-2026-123-REV
//
// The regex must capture the ENTIRE token including embedded spaces and dots
// that belong to the Sajilo fiscal-period notation.
//
// Strategy: match a known prefix segment (up to two alpha parts separated by
// hyphen or space), followed by the numeric sequence which may contain dots.
// ---------------------------------------------------------------------------

// Single-voucher guard used inside VoucherLink
const VOUCHER_REGEX_SINGLE =
  /^[A-Z]{2,8}(?:-[A-Z]{1,6})?[\s\-]?\d{2,6}(?:[.\-]\d{2,6}){0,2}-\d{2,8}(?:-[A-Z0-9]{1,10})?$/i;

// Splitter used inside VoucherTextLinkifier to extract voucher tokens from prose.
const VOUCHER_REGEX_SPLIT =
  /([A-Z]{2,8}(?:-[A-Z]{1,6})?[\s\-]?\d{2,6}(?:[.\-]\d{2,6}){0,2}-\d{2,8}(?:-[A-Z0-9]{1,10})?)/gi;

export default function VoucherLink({ voucherNumber, children }) {
  const { openVoucher } = useGlobalVoucherDrawer();
  const text = children || voucherNumber;
  if (!voucherNumber) return <span>{text}</span>;

  const vNumStr = String(voucherNumber).trim();
  const isVoucher = VOUCHER_REGEX_SINGLE.test(vNumStr);
  if (!isVoucher) return <span>{text}</span>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            onClick={(e) => {
              e.stopPropagation();
              openVoucher(voucherNumber);
            }}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline font-medium cursor-pointer"
          >
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>View Voucher</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function VoucherTextLinkifier({ text }) {
  if (!text) return null;
  const strText = String(text);

  // Split the input on any voucher-like token (handles spaces + dots in Sajilo format)
  const parts = strText.split(VOUCHER_REGEX_SPLIT);

  return (
    <>
      {parts.map((part, i) => {
        if (VOUCHER_REGEX_SPLIT.test(part)) {
          // Reset lastIndex after stateful global regex test
          VOUCHER_REGEX_SPLIT.lastIndex = 0;
          return (
            <VoucherLink key={i} voucherNumber={part}>
              <span className="cursor-pointer text-primary hover:underline">{part}</span>
            </VoucherLink>
          );
        }
        VOUCHER_REGEX_SPLIT.lastIndex = 0;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
