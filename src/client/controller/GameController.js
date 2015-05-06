/**
 * Game Controller
 *
 * @param {Object} $scope
 * @param {Object} $routeParams
 * @param {SocketClient} client
 * @param {GameRepository} repository
 * @param {Chat} chat
 * @param {Radio} radio
 */
function GameController($scope, $routeParams, $location, client, repository, chat, radio, sound)
{
    document.body.classList.add('game-mode');

    this.$scope          = $scope;
    this.$location       = $location;
    this.client          = client;
    this.repository      = repository;
    this.radio           = radio;
    this.chat            = chat;
    this.sound           = sound;
    this.room            = null;
    this.game            = null;
    this.assetsLoaded    = false;
    this.setup           = false;
    this.renderElement   = null;

    // Binding
    this.onAssetsLoaded = this.onAssetsLoaded.bind(this);
    this.onMove         = this.onMove.bind(this);
    this.onBorderless   = this.onBorderless.bind(this);
    this.onSpectate     = this.onSpectate.bind(this);
    this.onUnload       = this.onUnload.bind(this);
    this.onExit         = this.onExit.bind(this);
    this.onFirstRound   = this.onFirstRound.bind(this);
    this.backToRoom     = this.backToRoom.bind(this);
    this.applyScope     = this.applyScope.bind(this);
    this.digestScope    = this.digestScope.bind(this);

    // Hydrate scope:
    this.$scope.radio           = this.radio;
    this.$scope.sound           = this.sound;
    this.$scope.backToRoom      = this.backToRoom;
    this.$scope.toggleSound     = this.sound.toggle;
    this.$scope.toggleRadio     = this.radio.toggle;
    this.$scope.avatars         = null;
    this.$scope.spectating      = false;
    this.$scope.$parent.profile = false;

    var name = decodeURIComponent($routeParams.name);

    this.repository.start();

    if (!this.repository.game || this.repository.game.name !== name) {
        this.$location.path('/room/' + encodeURIComponent(name));
    } else {
        this.loadGame(this.repository.game);
    }
}

/**
 * Confirmation message
 *
 * @type {String}
 */
GameController.prototype.confirmation = 'Are you sure you want to leave the game?';

/**
 * Attach socket Events
 */
GameController.prototype.attachEvents = function()
{
    // Close on end?
    this.repository.on('borderless', this.onBorderless);
    this.repository.on('spectate', this.onSpectate);
};

/**
 * Attach socket Events
 */
GameController.prototype.detachEvents = function()
{
    this.repository.off('borderless', this.onBorderless);
    this.repository.off('spectate', this.onSpectate);
};

/**
 * Load game
 */
GameController.prototype.loadGame = function(game)
{
    this.offUnload        = this.$scope.$on('$locationChangeStart', this.onUnload);
    this.offDestroy       = this.$scope.$on('$destroy', this.onExit);
    window.onbeforeunload = this.onUnload;

    this.game = game;
    this.room = game.room;

    this.renderElement = document.getElementById('render');

    this.game.loadDOM();
    this.game.bonusManager.on('load', this.onAssetsLoaded);

    gamepadListener.stop();

    for (var avatar, i = this.game.avatars.items.length - 1; i >= 0; i--) {
        avatar = this.game.avatars.items[i];
        if (avatar.local) {
            avatar.input.on('move', this.onMove);
            if (avatar.input.useGamepad()) {
                gamepadListener.start();
            }
        }
    }

    this.radio.setActive(true);

    // Hydrate scope:
    this.$scope.game    = this.game;
    this.$scope.avatars = this.game.avatars.items;

    this.attachEvents();

    this.repository.on('round:new', this.onFirstRound);

    this.setup = true;
    this.checkReady();
};

/**
 * On assets loaded
 */
GameController.prototype.onAssetsLoaded = function()
{
    this.assetsLoaded = true;
    this.game.bonusManager.off('load', this.onAssetsLoaded);
    this.checkReady();
};

/**
 * Check loading is done
 */
GameController.prototype.checkReady = function()
{
    if (this.assetsLoaded && this.setup) {
        this.client.addEvent('ready');
    }
};

/**
 * Clear waiting list on first round
 *
 * @param {Event} e
 */
GameController.prototype.onFirstRound = function(e)
{
    setTimeout(function () { this.repository.off('round:new', this.onFirstRound); }.bind(this), 0);
    this.digestScope();
};

/**
 * On move
 *
 * @param {Event} e
 */
GameController.prototype.onMove = function(e)
{
    this.client.addEvent('player:move', {avatar: e.detail.avatar.id, move: e.detail.move ? e.detail.move : 0});
};

/**
 * On borderless
 *
 * @param {Event} e
 */
GameController.prototype.onBorderless = function(e)
{
    this.renderElement.classList.toggle('borderless', this.game.borderless);
};

/**
 * On spectate
 */
GameController.prototype.onSpectate = function(e)
{
    this.$scope.spectating = true;
    this.digestScope();
};

/**
 * Leave room
 */
GameController.prototype.onExit = function()
{
    if ((this.room && this.$location.path() !== this.room.url) || (this.game && this.game.started)) {
        this.repository.parent.leave();
        this.chat.clear();
    }

    window.onbeforeunload = null;

    this.sound.stop('win');
    this.offUnload();
    this.offDestroy();
    this.close();
};

/**
 * On unload
 *
 * @param {Event} e
 *
 * @return {String}
 */
GameController.prototype.onUnload = function(e)
{
    if (this.needConfirmation()) {
        if (e.type === 'beforeunload') {
            return this.confirmation;
        } else if (!confirm(this.confirmation)) {
            return e.preventDefault();
        }
    }
};

/**
 * Do we need confirmation before leaving?
 *
 * @return {Boolean}
 */
GameController.prototype.needConfirmation = function()
{
    return !this.$scope.spectating && this.game.started;
};

/**
 * Close game
 */
GameController.prototype.close = function()
{
    if (this.game) {
        this.detachEvents();

        var avatars = this.game.avatars.filter(function () { return this.input; }).items;

        for (var i = avatars.length - 1; i >= 0; i--) {
            avatars[i].input.off('move', this.onMove);
        }

        delete this.game;
    }
};

/**
 * Go back to the room
 */
GameController.prototype.backToRoom = function()
{
    this.$location.path(this.room.url);
};

/**
 * Apply scope
 */
GameController.prototype.applyScope = CurvytronController.prototype.applyScope;

/**
 * Digest scope
 */
GameController.prototype.digestScope = CurvytronController.prototype.digestScope;
