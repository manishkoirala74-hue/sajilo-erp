import { useGlobalVoucherDrawer } from '@/lib/GlobalVoucherContext';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export default function VoucherLink({ voucherNumber, children }) {
  const { openVoucher } = useGlobalVoucherDrawer();
  const text = children || voucherNumber;
  if (!voucherNumber) return <span>{text}</span>;

  const vNumStr = String(voucherNumber).toUpperCase().trim();
  // Match any standard voucher pattern (e.g. SI-2026-001, MYPR-2026-123-REV, JV-202611-12)
  // [2-8 uppercase alphanumeric] + hyphen + [4-8 digit year/date] + hyphen + [1-6 digits] + optional suffix
  // Wait, some vouchers might be INV-001. So \d+ after hyphen.
  // Actually, let's just do: 2 to 8 alphanumeric, hyphen, then digits (at least 3), optionally more hyphens and letters/digits
  const isVoucher = /^[A-Z0-9]{2,8}-\d{3,}/.test(vNumStr);
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
  
  // Natively matches anything looking like a voucher: Prefix(2-8 chars)-Date(4-8 chars)-Number(1-6 chars)[-Suffix]
  // Fallback to simpler Prefix-Number if it doesn't have a date part
  // Matches: SI-2026-001, PI-2026-012-REV, INV-1234, MYPREFIX-2025-0001
  const regex = /([A-Z0-9]{2,8}-\d{3,}(?:-[A-Z0-9]+)?)/gi;
  
  const parts = strText.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(regex)) {
          return (
            <VoucherLink key={i} voucherNumber={part}>
              <span className="cursor-pointer text-primary hover:underline">{part}</span>
            </VoucherLink>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
