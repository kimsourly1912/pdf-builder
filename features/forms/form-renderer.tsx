"use client";
import { useEffect, useRef, useState, useId } from "react";
import Image from "next/image";
import { Controller, useForm } from "react-hook-form";
import type { Control, Resolver, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  applyResumeSuggestions,
  hasRecipientValue,
} from "@/features/templates/recipient-prefill";
import { answerSchema, initialAnswers } from "./form";
import type { FormDefinition, FormField } from "./form";

type Values = Record<string, unknown>;
export type FormMedia = Map<string, File>;
export function FormRenderer(props: {
  definition: FormDefinition;
  initial?: Values;
  readonlyInitial?: Values;
  suggestions?: Values;
  busy?: boolean;
  onSubmit?: (values: Values, media: FormMedia) => Promise<void>;
  onDraft?: (values: Values, media: FormMedia) => Promise<void>;
  onValues?: (values: Values) => void;
  onMedia?: (id: string, file: File | null) => void;
  imageUrl?: (fieldId: string) => string;
  submitLabel?: string;
  preview?: boolean;
  compact?: boolean;
}) {
  const form = useForm<Values>({
    defaultValues: initialAnswers(props.definition, props.initial),
    resolver: zodResolver(answerSchema(props.definition)) as Resolver<Values>,
    mode: "onBlur",
  });
  const media = useRef<FormMedia>(new Map());
  const [draftBusy, setDraftBusy] = useState(false);
  const onValues = props.onValues;
  useEffect(() => {
    if (!onValues) return;
    onValues(form.getValues());
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => onValues(values),
    });
  }, [form, onValues]);
  const disabled = props.busy || draftBusy;
  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          if (props.onSubmit) await props.onSubmit(values, media.current);
        })(event);
      }}
    >
      {props.suggestions && Object.keys(props.suggestions).length > 0 && (
        <div className="rounded-lg border bg-primary/5 p-3 text-sm">
          <p className="mb-2">
            Approved CV details are available. Fill empty answers, then check
            them before submitting.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const values = form.getValues();
              const fieldIds = props.definition.fields
                .filter((f) => f.autofill)
                .map((f) => f.id);
              const next = applyResumeSuggestions({
                currentValues: values,
                suggestions: props.suggestions ?? {},
                fieldIds,
                protectedFieldIds: Object.keys(values).filter((id) =>
                  hasRecipientValue(values[id]),
                ),
              });
              for (const id of fieldIds)
                if (next[id] !== values[id])
                  form.setValue(id, next[id], {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
            }}
          >
            Fill empty fields from approved CV
          </Button>
        </div>
      )}
      <div
        className={`grid grid-cols-1 gap-5 ${props.compact ? "" : "sm:grid-cols-2"}`}
      >
        {props.definition.fields.map((field) => (
          <div
            key={field.id}
            className={
              props.compact ||
              (field.width === "half" && field.type !== "section")
                ? "min-w-0"
                : "min-w-0 sm:col-span-2"
            }
          >
            <FormFieldControl
              field={field}
              control={form.control}
              errors={form.formState.errors}
              disabled={disabled}
              imageUrl={props.imageUrl?.(field.id)}
              locked={
                !field.editable &&
                Boolean(field.autofill) &&
                (props.readonlyInitial ?? props.initial)?.[field.id] !==
                  undefined &&
                (props.readonlyInitial ?? props.initial)?.[field.id] !== ""
              }
              onMedia={(file) => {
                props.onMedia?.(field.id, file);
                if (file) media.current.set(field.id, file);
                else media.current.delete(field.id);
              }}
            />
          </div>
        ))}
      </div>
      {!props.definition.fields.length && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Add your first field to build this form.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {props.onDraft && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={async () => {
              setDraftBusy(true);
              try {
                await props.onDraft?.(form.getValues(), media.current);
              } finally {
                setDraftBusy(false);
              }
            }}
          >
            Save draft
          </Button>
        )}
        {(props.onSubmit || props.preview) && (
          <Button type="submit" disabled={disabled}>
            {disabled
              ? "Saving…"
              : (props.submitLabel ??
                (props.preview ? "Check validation" : "Submit form"))}
          </Button>
        )}
      </div>
      {form.formState.isSubmitted &&
        Object.keys(form.formState.errors).length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            Check the highlighted fields before submitting.
          </p>
        )}
      {props.preview && form.formState.isSubmitSuccessful && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          These answers pass validation. Preview does not submit a response.
        </p>
      )}
    </form>
  );
}
export function FormFieldControl(props: {
  field: FormField;
  control: Control<Values>;
  errors?: FieldErrors<Values>;
  disabled?: boolean;
  locked?: boolean;
  onMedia?: (file: File | null) => void;
  imageUrl?: string;
}) {
  const { field: definition } = props;
  const controlId = useId();
  if (definition.type === "section")
    return (
      <div className="border-b pb-3">
        <h2 className="text-lg font-semibold">{definition.label}</h2>
        {definition.help && (
          <p className="mt-1 text-sm text-muted-foreground">
            {definition.help}
          </p>
        )}
      </div>
    );
  const error = props.errors?.[definition.id]?.message;
  return (
    <div className="space-y-2" data-field-id={definition.id}>
      <Label htmlFor={controlId}>
        {definition.label}
        {definition.required && (
          <span className="text-destructive" aria-label="required">
            {" "}
            *
          </span>
        )}
      </Label>
      {definition.help && (
        <p id={`${controlId}-help`} className="text-sm text-muted-foreground">
          {definition.help}
        </p>
      )}
      <Controller
        control={props.control}
        name={definition.id}
        render={({ field }) => {
          const disabled = props.disabled || props.locked;
          const shared = {
            id: controlId,
            name: field.name,
            ref: field.ref,
            onBlur: field.onBlur,
            disabled,
            "aria-invalid": Boolean(error),
            "aria-describedby": error
              ? `${controlId}-error`
              : `${controlId}-help`,
          };
          const value =
            typeof field.value === "string" || typeof field.value === "number"
              ? String(field.value)
              : "";
          if (definition.type === "paragraph")
            return (
              <Textarea
                {...shared}
                rows={4}
                value={value}
                onChange={field.onChange}
                maxLength={definition.maxLength}
              />
            );
          if (definition.type === "dropdown")
            return (
              <select
                {...shared}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={value}
                onChange={field.onChange}
              >
                <option value="">Choose an option</option>
                {definition.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
          if (["radio", "checkboxes"].includes(definition.type))
            return (
              <fieldset
                disabled={disabled}
                className="space-y-2"
                aria-label={definition.label}
              >
                {definition.options.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <input
                      type={definition.type === "radio" ? "radio" : "checkbox"}
                      name={definition.id}
                      value={o.id}
                      checked={
                        definition.type === "radio"
                          ? value === o.id
                          : Array.isArray(field.value) &&
                            field.value.includes(o.id)
                      }
                      onBlur={field.onBlur}
                      onChange={() =>
                        field.onChange(
                          definition.type === "radio"
                            ? o.id
                            : Array.isArray(field.value) &&
                                field.value.includes(o.id)
                              ? field.value.filter((v) => v !== o.id)
                              : [
                                  ...(Array.isArray(field.value)
                                    ? field.value
                                    : []),
                                  o.id,
                                ],
                        )
                      }
                      className="size-4 accent-primary"
                    />
                    {o.label}
                  </label>
                ))}
              </fieldset>
            );
          if (definition.type === "checkbox")
            return (
              <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
                <input
                  {...shared}
                  type="checkbox"
                  checked={field.value === true}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="size-4 accent-primary"
                />
                {definition.help || "Yes"}
              </label>
            );
          if (definition.type === "photo" || definition.type === "signature")
            return (
              <MediaControl
                field={definition}
                controlId={controlId}
                disabled={disabled}
                storedUrl={value ? props.imageUrl : undefined}
                onChange={(file) => {
                  props.onMedia?.(file);
                  field.onChange(file ? `upload:${file.name}` : "");
                }}
              />
            );
          return (
            <Input
              {...shared}
              type={
                definition.type === "email"
                  ? "email"
                  : definition.type === "number"
                    ? "number"
                    : definition.type === "date"
                      ? "date"
                      : "text"
              }
              value={value}
              onChange={field.onChange}
              min={definition.min}
              max={definition.max}
              maxLength={definition.maxLength}
              step={definition.type === "number" ? "any" : undefined}
            />
          );
        }}
      />
      {error && (
        <p
          id={`${controlId}-error`}
          role="alert"
          className="text-sm text-destructive"
        >
          {String(error)}
        </p>
      )}
    </div>
  );
}
function MediaControl(props: {
  field: FormField;
  controlId: string;
  disabled?: boolean;
  storedUrl?: string;
  onChange: (file: File | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    pad = useRef<import("signature_pad").default | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    if (props.field.type !== "signature" || !canvas.current) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    void import("signature_pad").then(({ default: SignaturePad }) => {
      if (cancelled || !canvas.current) return;
      const surface = canvas.current;
      let previousWidth = surface.getBoundingClientRect().width;
      pad.current = new SignaturePad(surface, {
        backgroundColor: "rgb(255,255,255)",
        penColor: "rgb(0,0,0)",
      });
      const resize = () => {
        const rect = surface.getBoundingClientRect(),
          ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (!rect.width) return;
        const groups = pad.current?.toData() ?? [];
        const scale = previousWidth ? rect.width / previousWidth : 1;
        for (const group of groups)
          for (const point of group.points) point.x *= scale;
        surface.width = Math.round(rect.width * ratio);
        surface.height = Math.round(rect.height * ratio);
        surface.getContext("2d")?.scale(ratio, ratio);
        pad.current?.clear();
        pad.current?.fromData(groups);
        previousWidth = rect.width;
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(surface);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      pad.current?.off();
      pad.current = null;
    };
  }, [props.field.type]);
  const change = (next: File | null) => {
    setFile(next);
    setUrl(next ? URL.createObjectURL(next) : null);
    setError("");
    props.onChange(next);
  };
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      {(url || props.storedUrl) && (
        <Image
          unoptimized
          width={600}
          height={180}
          src={(url ?? props.storedUrl)!}
          alt={`${props.field.label} preview`}
          className="max-h-36 max-w-full rounded-md object-contain"
        />
      )}
      {props.field.type === "signature" && (
        <>
          <canvas
            ref={canvas}
            width={600}
            height={180}
            className={`h-36 w-full touch-none rounded-md border bg-white ${props.disabled ? "pointer-events-none opacity-50" : ""}`}
            aria-label={`Draw ${props.field.label}`}
          />
          <p className="text-xs text-muted-foreground">
            Draw above and choose Use signature, or upload a signature image.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.disabled}
              onClick={() => {
                pad.current?.clear();
                change(null);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.disabled}
              onClick={() => {
                if (!pad.current || pad.current.isEmpty()) {
                  setError("Draw a signature first.");
                  return;
                }
                canvas.current?.toBlob((blob) => {
                  if (blob)
                    change(
                      new File([blob], "signature.png", { type: "image/png" }),
                    );
                });
              }}
            >
              Use signature
            </Button>
          </div>
        </>
      )}
      <Input
        id={props.controlId}
        type="file"
        accept="image/png,image/jpeg"
        disabled={props.disabled}
        aria-label={`Upload ${props.field.label}`}
        onChange={(e) => {
          const next = e.target.files?.[0];
          if (!next) return;
          if (
            next.size > 8 * 1024 * 1024 ||
            !["image/png", "image/jpeg"].includes(next.type)
          ) {
            setError("Choose a PNG or JPEG up to 8 MB.");
            return;
          }
          change(next);
          e.target.value = "";
        }}
      />
      {(file || props.storedUrl) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={props.disabled}
          onClick={() => {
            pad.current?.clear();
            change(null);
          }}
        >
          Remove image
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
