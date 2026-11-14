"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type SubmitEvent } from "react";
import { parseForm, validateField, type FormState, type Rules } from "../lib/form";

/**
 * Wires an auth form to its server action. The same `rules` the action checks
 * run here first: a field is checked when the user leaves it after typing,
 * and the whole form on submit, so obviously invalid input never round-trips.
 */
export function useAuthForm<Field extends string, State extends FormState<Field>>(
  action: (state: Awaited<State>, formData: FormData) => Promise<State>,
  initialState: Awaited<State>,
  rules: Rules<Field>,
) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [errors, setErrors] = useState(state.fieldErrors);
  const [handledState, setHandledState] = useState(state);
  const edited = useRef(new Set<Field>());

  // A new server response replaces whatever the client last showed.
  if (handledState !== state) {
    setHandledState(state);
    setErrors(state.fieldErrors);
  }

  const { getAuth } = useAuth();
  const router = useRouter();
  const redirectTo = state.redirectTo;
  const navigating = useRef(false);
  useEffect(() => {
    if (!redirectTo || navigating.current) return;
    navigating.current = true;
    // Load the new session into AuthKitProvider (and so Convex) before leaving.
    void getAuth().finally(() => router.replace(redirectTo));
  }, [redirectTo, getAuth, router]);

  function check(name: Field, value: string) {
    const error = validateField(name, value, rules[name]);
    setErrors((current) => ({ ...current, [name]: error ?? undefined }));
  }

  function field(name: Field) {
    return {
      name,
      defaultValue: state.values[name],
      error: errors[name],
      onChange: (event: { currentTarget: HTMLInputElement }) => {
        edited.current.add(name);
        // Clear an error as soon as the input fixes it.
        if (errors[name]) check(name, event.currentTarget.value);
      },
      onBlur: (event: { currentTarget: HTMLInputElement }) => {
        if (edited.current.has(name)) check(name, event.currentTarget.value);
      },
    };
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    const result = parseForm(new FormData(event.currentTarget), rules);
    if (result.ok) return;
    event.preventDefault();
    setErrors(result.state.fieldErrors);
    const firstInvalid = Object.keys(result.state.fieldErrors)[0];
    const input = firstInvalid ? event.currentTarget.elements.namedItem(firstInvalid) : null;
    if (input instanceof HTMLElement) input.focus();
  }

  return {
    state,
    errors,
    field,
    formProps: { action: formAction, onSubmit, noValidate: true },
    // Stays busy after success until the navigation home happens.
    busy: pending || Boolean(redirectTo),
  };
}
