import { Router } from 'express';
import { createRecipeSchema, updateRecipeSchema } from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireHousehold } from '../../middleware/auth.js';
import * as recipeService from './service.js';

const router = Router();

router.get('/', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const recipes = await recipeService.getRecipes(req.householdId!);
    res.json(recipes);
  } catch (err) {
    next(err);
  }
});

router.get('/suggestions', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const suggestions = await recipeService.getSuggestions(req.householdId!);
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    const recipe = await recipeService.getRecipe(req.params.id, req.householdId!);
    res.json(recipe);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireHousehold, validate(createRecipeSchema), async (req, res, next) => {
  try {
    const recipe = await recipeService.createRecipe(req.body, req.householdId!, req.userId!);
    res.status(201).json(recipe);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireHousehold, validate(updateRecipeSchema), async (req, res, next) => {
  try {
    const recipe = await recipeService.updateRecipe(req.params.id, req.body, req.householdId!);
    res.json(recipe);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireHousehold, async (req, res, next) => {
  try {
    await recipeService.deleteRecipe(req.params.id, req.householdId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
