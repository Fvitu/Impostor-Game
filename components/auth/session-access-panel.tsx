"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LogIn, User, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validatePlayerName } from "@/lib/player-name";
import { getSavedPlayerName, savePlayerName } from "@/lib/storage";

type PanelMode = "choose" | "login" | "register" | "guest";

interface SessionAccessPanelProps {
	title: string;
	description: string;
	onAuthenticated: () => void;
	onGuest: (guestName: string) => void;
	onBack?: () => void;
	guestNote?: string;
	showChooseBack?: boolean;
}

export function SessionAccessPanel({
	title,
	description,
	onAuthenticated,
	onGuest,
	onBack,
	guestNote,
	showChooseBack = false,
}: SessionAccessPanelProps) {
	const { t } = useTranslation("auth");
	const { login, register } = useAuth();
	const [mode, setMode] = useState<PanelMode>("choose");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [loginIdentifier, setLoginIdentifier] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [registerEmail, setRegisterEmail] = useState("");
	const [registerUsername, setRegisterUsername] = useState("");
	const [registerPassword, setRegisterPassword] = useState("");
	const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
	const [guestName, setGuestName] = useState(getSavedPlayerName());

	const goTo = (nextMode: PanelMode) => {
		setError("");
		setLoading(false);
		setMode(nextMode);
	};

	const handleLogin = async () => {
		if (!loginIdentifier.trim() || !loginPassword) {
			return;
		}

		setLoading(true);
		setError("");
		const result = await login(loginIdentifier.trim(), loginPassword);
		if (result.error) {
			setError(result.error);
			setLoading(false);
			return;
		}

		onAuthenticated();
	};

	const handleRegister = async () => {
		if (!registerEmail.trim() || !registerUsername.trim() || !registerPassword || !registerConfirmPassword) {
			return;
		}

		const validatedUsername = validatePlayerName(registerUsername);
		if (!validatedUsername.isValid) {
			setError(validatedUsername.error ?? t("registering"));
			return;
		}

		if (registerPassword !== registerConfirmPassword) {
			setError(t("passwordMismatch"));
			return;
		}

		if (registerPassword.length < 6) {
			setError(t("passwordTooShort"));
			return;
		}

		setLoading(true);
		setError("");
		const result = await register(registerEmail.trim(), validatedUsername.value, registerPassword);
		if (result.error) {
			setError(result.error);
			setLoading(false);
			return;
		}

		onAuthenticated();
	};

	const handleGuestContinue = () => {
		const validatedGuestName = validatePlayerName(guestName);
		if (!validatedGuestName.isValid) {
			setError(validatedGuestName.error ?? t("guestContinue"));
			return;
		}

		savePlayerName(validatedGuestName.value);
		onGuest(validatedGuestName.value);
	};

	return (
		<div className="w-full space-y-4 animate-slide-up glow-box rounded-xl p-6 transition-all">
			{mode === "choose" && (
				<>
					{showChooseBack && onBack ? (
						<Button variant="ghost" onClick={onBack} className="mb-6 text-muted-foreground">
							<ArrowLeft className="h-4 w-4 mr-2" />
							{t("back")}
						</Button>
					) : null}
					<div className="text-center mb-8">
						<User className="h-12 w-12 text-primary mx-auto mb-4" />
						<h2 className="text-xl font-bold text-foreground">{title}</h2>
						<p className="text-sm text-muted-foreground mt-2">{description}</p>
					</div>
					<Button onClick={() => goTo("login")} size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
						<LogIn className="h-5 w-5 mr-2" />
						{t("loginBtn")}
					</Button>
					<Button
						onClick={() => goTo("register")}
						size="lg"
						variant="outline"
						className="w-full h-14 text-base border-border text-foreground hover:bg-secondary hover:text-secondary-foreground">
						<UserPlus className="h-5 w-5 mr-2" />
						{t("registerBtn")}
					</Button>
					{guestNote ? <p className="text-xs text-center text-muted-foreground">{guestNote}</p> : null}
					<Button onClick={() => goTo("guest")} variant="ghost" className="w-full text-muted-foreground hover:text-foreground">
						{t("continueAsGuest")}
					</Button>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</>
			)}

			{mode === "login" && (
				<>
					<Button variant="ghost" onClick={() => goTo("choose")} className="mb-6 text-muted-foreground">
						<ArrowLeft className="h-4 w-4 mr-2" />
						{t("back")}
					</Button>
					<h2 className="text-xl font-bold text-foreground mb-6">{t("loginTitle")}</h2>
					<div className="space-y-4">
						<div>
							<label htmlFor="shared-login-id" className="block text-sm font-medium text-foreground mb-2">
								{t("emailOrUsername")}
							</label>
							<Input
								id="shared-login-id"
								placeholder={t("emailOrUsernamePlaceholder")}
								value={loginIdentifier}
								onChange={(event) => setLoginIdentifier(event.target.value)}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
							/>
						</div>
						<div>
							<label htmlFor="shared-login-password" className="block text-sm font-medium text-foreground mb-2">
								{t("password")}
							</label>
							<Input
								id="shared-login-password"
								type="password"
								placeholder={t("passwordPlaceholder")}
								value={loginPassword}
								onChange={(event) => setLoginPassword(event.target.value)}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										void handleLogin();
									}
								}}
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button
							onClick={() => {
								void handleLogin();
							}}
							disabled={!loginIdentifier.trim() || !loginPassword || loading}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							{loading ? t("loggingIn") : t("loginBtn")}
						</Button>
					</div>
				</>
			)}

			{mode === "register" && (
				<>
					<Button variant="ghost" onClick={() => goTo("choose")} className="mb-6 text-muted-foreground">
						<ArrowLeft className="h-4 w-4 mr-2" />
						{t("back")}
					</Button>
					<h2 className="text-xl font-bold text-foreground mb-6">{t("registerTitle")}</h2>
					<div className="space-y-4">
						<div>
							<label htmlFor="shared-register-email" className="block text-sm font-medium text-foreground mb-2">
								{t("email")}
							</label>
							<Input
								id="shared-register-email"
								type="email"
								placeholder={t("emailPlaceholder")}
								value={registerEmail}
								onChange={(event) => setRegisterEmail(event.target.value)}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
							/>
						</div>
						<div>
							<label htmlFor="shared-register-username" className="block text-sm font-medium text-foreground mb-2">
								{t("username")}
							</label>
							<Input
								id="shared-register-username"
								placeholder={t("usernamePlaceholder")}
								value={registerUsername}
								onChange={(event) => setRegisterUsername(event.target.value)}
								maxLength={20}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
							/>
						</div>
						<div>
							<label htmlFor="shared-register-password" className="block text-sm font-medium text-foreground mb-2">
								{t("password")}
							</label>
							<Input
								id="shared-register-password"
								type="password"
								placeholder={t("passwordPlaceholder")}
								value={registerPassword}
								onChange={(event) => setRegisterPassword(event.target.value)}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
							/>
						</div>
						<div>
							<label htmlFor="shared-register-confirm-password" className="block text-sm font-medium text-foreground mb-2">
								{t("confirmPassword")}
							</label>
							<Input
								id="shared-register-confirm-password"
								type="password"
								placeholder={t("confirmPasswordPlaceholder")}
								value={registerConfirmPassword}
								onChange={(event) => setRegisterConfirmPassword(event.target.value)}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										void handleRegister();
									}
								}}
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button
							onClick={() => {
								void handleRegister();
							}}
							disabled={!registerEmail.trim() || !registerUsername.trim() || !registerPassword || !registerConfirmPassword || loading}
							size="lg"
							className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							{loading ? t("registering") : t("registerBtn")}
						</Button>
					</div>
				</>
			)}

			{mode === "guest" && (
				<>
					<Button variant="ghost" onClick={() => goTo("choose")} className="mb-6 text-muted-foreground">
						<ArrowLeft className="h-4 w-4 mr-2" />
						{t("back")}
					</Button>
					<h2 className="text-xl font-bold text-foreground mb-2">{t("guestTitle")}</h2>
					<p className="text-sm text-muted-foreground mb-6">{t("guestDescription")}</p>
					<div className="space-y-4">
						<div>
							<label htmlFor="guest-name" className="block text-sm font-medium text-foreground mb-2">
								{t("guestNameLabel")}
							</label>
							<Input
								id="guest-name"
								placeholder={t("guestNamePlaceholder")}
								value={guestName}
								onChange={(event) => setGuestName(event.target.value)}
								maxLength={20}
								className="h-12 text-base border-border text-foreground placeholder:text-muted-foreground"
								autoComplete="off"
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										handleGuestContinue();
									}
								}}
							/>
						</div>
						<p className="text-xs text-muted-foreground">{t("guestRules")}</p>
						{error && <p className="text-sm text-destructive">{error}</p>}
						<Button onClick={handleGuestContinue} disabled={!guestName.trim()} size="lg" className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90">
							{t("guestContinue")}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}