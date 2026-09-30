--[[
  Aquino Studios — estadísticas del juego → página web
  =====================================================
  Manda a la web (Edge Function "game-events") la etapa máxima, el mejor tiempo,
  las victorias, las muertes y el tiempo jugado de cada jugador. Aparecen en la
  pestaña "Récords" del juego y en el perfil de quien tenga ese usuario de Roblox.

  CÓMO INSTALARLO (Roblox Studio):
  1. Home → Game Settings → Security → activá "Allow HTTP Requests".
  2. En ServerScriptService creá un Script (NO LocalScript), llamalo "AquinoStats"
     y pegá todo este archivo.
  3. La clave secreta (la misma que cargaste como GAME_API_KEY en Supabase):
       - Recomendado: Creator Dashboard → tu experiencia → Secrets → "aquino_api_key".
       - Para probar en Studio podés escribirla en API_KEY_FALLBACK (este script queda
         en el servidor, los jugadores no lo pueden ver).
  4. Ajustá CONFIG: el slug del juego y cuántas etapas tiene.

  Funciona solo con cualquier obby que use leaderstats → "Stage" (o el nombre que
  pongas en STAGE_NAME). Si tu juego marca la victoria de otra forma, desde otro Script:
       _G.AquinoStats.win(player)        -- terminó el obby
       _G.AquinoStats.setStage(player, 5)
]]

local CONFIG = {
	GAME = "obby-imposible", -- slug del juego en la web
	URL = "https://mosaxafxqpsozjzmfvib.supabase.co/functions/v1/game-events",
	STAGE_NAME = "Stage", -- nombre del valor dentro de leaderstats
	FINAL_STAGE = 100, -- al llegar a esta etapa cuenta como victoria (0 = no usar)
	SEND_EVERY = 60, -- segundos entre envíos
	SECRET_NAME = "aquino_api_key",
	API_KEY_FALLBACK = "", -- solo para probar en Studio; mejor usar Secrets
}

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- Clave: primero los Secrets de Roblox; si no hay, la de respaldo
local apiKey
do
	local ok, secret = pcall(function()
		return HttpService:GetSecret(CONFIG.SECRET_NAME)
	end)
	if ok and secret then
		apiKey = secret
	elseif CONFIG.API_KEY_FALLBACK ~= "" then
		apiKey = CONFIG.API_KEY_FALLBACK
	else
		warn("[AquinoStats] No hay clave: cargá el Secret '" .. CONFIG.SECRET_NAME .. "' o API_KEY_FALLBACK. No se mandan estadísticas.")
		return
	end
end

-- Lo que juntó cada jugador desde el último envío
local pending = {} -- [userId] = { stage, bestTimeMs, wins, deaths, playtime, joined }
local runStart = {} -- cuándo empezó la carrera actual (para el mejor tiempo)
local lastTick = {} -- para sumar tiempo jugado

local function entry(player)
	local e = pending[player.UserId]
	if not e then
		e = { stage = 0, bestTimeMs = 0, wins = 0, deaths = 0, playtime = 0, joined = false }
		pending[player.UserId] = e
	end
	return e
end

local function addPlaytime(player)
	local now = os.clock()
	if lastTick[player] then
		entry(player).playtime += math.floor(now - lastTick[player])
	end
	lastTick[player] = now
end

local function win(player)
	local e = entry(player)
	e.wins += 1
	if runStart[player] then
		local ms = math.floor((os.clock() - runStart[player]) * 1000)
		if e.bestTimeMs == 0 or ms < e.bestTimeMs then
			e.bestTimeMs = ms
		end
	end
	runStart[player] = os.clock() -- la próxima carrera arranca de nuevo
end

local function setStage(player, stage)
	local e = entry(player)
	if stage > e.stage then
		e.stage = stage
	end
	if stage <= 1 then
		runStart[player] = os.clock()
	end
	if CONFIG.FINAL_STAGE > 0 and stage >= CONFIG.FINAL_STAGE then
		win(player)
	end
end

_G.AquinoStats = { win = win, setStage = setStage }

local function send(list)
	if #list == 0 then
		return
	end
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = CONFIG.URL,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["x-game-key"] = apiKey },
			Body = HttpService:JSONEncode({ game = CONFIG.GAME, players = list }),
		})
	end)
	if not ok then
		warn("[AquinoStats] No se pudo enviar: " .. tostring(res))
	elseif not res.Success then
		warn("[AquinoStats] La web respondió " .. res.StatusCode .. ": " .. res.Body)
	end
end

-- Arma la lista con lo pendiente y lo vacía (los contadores se mandan como "lo nuevo")
local function collect(onlyPlayer)
	local list = {}
	for _, player in ipairs(onlyPlayer and { onlyPlayer } or Players:GetPlayers()) do
		addPlaytime(player)
		local e = pending[player.UserId]
		if e and (e.joined or e.stage > 0 or e.wins > 0 or e.deaths > 0 or e.playtime > 0) then
			table.insert(list, {
				userId = player.UserId,
				username = player.Name,
				displayName = player.DisplayName,
				stage = e.stage,
				bestTimeMs = e.bestTimeMs,
				wins = e.wins,
				deaths = e.deaths,
				playtime = e.playtime,
				joined = e.joined,
			})
			-- se conserva el récord (por si baja), los contadores vuelven a cero
			pending[player.UserId] = { stage = e.stage, bestTimeMs = e.bestTimeMs, wins = 0, deaths = 0, playtime = 0, joined = false }
		end
	end
	return list
end

local function watch(player)
	entry(player).joined = true
	runStart[player] = os.clock()
	lastTick[player] = os.clock()

	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid", 10)
		if humanoid then
			humanoid.Died:Connect(function()
				entry(player).deaths += 1
			end)
		end
	end)

	task.spawn(function()
		local leaderstats = player:WaitForChild("leaderstats", 30)
		local value = leaderstats and leaderstats:WaitForChild(CONFIG.STAGE_NAME, 30)
		if value and (value:IsA("IntValue") or value:IsA("NumberValue")) then
			setStage(player, value.Value)
			value.Changed:Connect(function(v)
				setStage(player, v)
			end)
		end
	end)
end

Players.PlayerAdded:Connect(watch)
for _, p in ipairs(Players:GetPlayers()) do
	watch(p)
end

Players.PlayerRemoving:Connect(function(player)
	send(collect(player))
	pending[player.UserId] = nil
	runStart[player] = nil
	lastTick[player] = nil
end)

-- Envío periódico
task.spawn(function()
	while true do
		task.wait(CONFIG.SEND_EVERY)
		send(collect())
	end
end)

-- Si el servidor se apaga, manda lo último
game:BindToClose(function()
	if RunService:IsStudio() then
		task.wait(1)
	end
	send(collect())
end)

print("[AquinoStats] Listo: mandando estadísticas de " .. CONFIG.GAME)
