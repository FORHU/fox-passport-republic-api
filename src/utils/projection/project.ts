export const getUserProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["first_name", "last_name", "phone_number", "email", "date_of_birth", "country", "organization", "social link", "company_name", "role"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getVenueProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["name", "representation", "description", "address", "cancellation_policy", "keywords", "status", "age_restriction", "venue_details"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getCancellationPolicyProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["venue_id", "updatedAt", "createdAt"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 0;
      return acc;
    }, {}),
  };
};

export const getKeywordsProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["keyword"];
  }

  return {
    $project: {
      ...fields.reduce((acc, field) => {
        acc[field] = 1;
        return acc;
      }, {}),
      categories: { $arrayElemAt: ["$categories", 0] },
    },
  };
};

export const getQuestionsProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["question", "reference", "answer", "option"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 0;
      return acc;
    }, {}),
  };
};

export const getFilesProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["filename", "path", "craetedAt"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 0;
      return acc;
    }, {}),
  };
};
