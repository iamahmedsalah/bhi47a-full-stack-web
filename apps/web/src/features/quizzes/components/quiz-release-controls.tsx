'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { QuizReleaseMode } from '@student-portal/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface Props {
  resultsReleaseMode: QuizReleaseMode;
  reviewReleaseMode: QuizReleaseMode;
  publishResults: boolean;
  allowReview: boolean;
  endsAt?: string;
  onResultsMode: (mode: QuizReleaseMode) => void;
  onReviewMode: (mode: QuizReleaseMode) => void;
  onPublishResults: (value: boolean) => void;
  onAllowReview: (value: boolean) => void;
}

export function QuizReleaseControls(props: Props) {
  const t = useTranslations('quizRelease');
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const automatic = props.resultsReleaseMode === 'after_close' || props.reviewReleaseMode === 'after_close';
  const close = props.endsAt ? new Date(props.endsAt) : undefined;
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-4 space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {(['results', 'review'] as const).map((kind) => {
          const results = kind === 'results';
          const mode = results ? props.resultsReleaseMode : props.reviewReleaseMode;
          const onMode = results ? props.onResultsMode : props.onReviewMode;
          return (
            <div key={kind} className="space-y-2">
              <label id={`quiz-${kind}-label`} htmlFor={`quiz-${kind}-release`} className="text-xs font-semibold">{t(kind)}</label>
              <DropdownMenu.Root dir={dir}>
                <DropdownMenu.Trigger asChild>
                  <Button id={`quiz-${kind}-release`} aria-labelledby={`quiz-${kind}-label`} type="button" variant="outline" className="w-full justify-start text-start rounded-squircle text-xs whitespace-normal">
                    {t(mode === 'manual' ? 'manual' : 'afterClose')}
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content asChild align="start" sideOffset={4}>
                    <div dir={dir} className="z-50 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl">
                      <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => { if (value === 'manual' || value === 'after_close') onMode(value); }}>
                        {(['manual', 'after_close'] as const).map((value) => (
                          <DropdownMenu.RadioItem key={value} value={value} className="cursor-pointer rounded-squircle px-3 py-2 text-xs outline-none focus:bg-primary/10 data-[state=checked]:font-bold">
                            {t(value === 'manual' ? 'manual' : 'afterClose')}
                          </DropdownMenu.RadioItem>
                        ))}
                      </DropdownMenu.RadioGroup>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {mode === 'manual' && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={results ? props.publishResults : props.allowReview} onCheckedChange={(value) => (results ? props.onPublishResults : props.onAllowReview)(value === true)} />
                  {t(results ? 'showMarks' : 'enableReview')}
                </label>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t('reviewGate')}</p>
      {automatic && (
        <p role={close && Number.isFinite(close.getTime()) ? undefined : 'alert'} className="text-xs text-primary">
          {close && Number.isFinite(close.getTime())
            ? t('releaseAt', { time: close.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }) })
            : t('closingRequired')}
        </p>
      )}
    </div>
  );
}
